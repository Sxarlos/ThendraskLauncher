import { app, BrowserWindow, shell, net } from 'electron'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { UpdateInfo } from '@shared/types'

// ── UPDATE MANIFEST ───────────────────────────────────────────────────────────
// A tiny public GitHub Gist contains the latest version info.
// Source code stays completely private — the Gist only exposes a version number
// and a download link. Nothing sensitive.
//
// ONE-TIME SETUP:
//   1. Go to gist.github.com → New gist
//   2. Filename: latest-version.json
//   3. Paste the contents below and click "Create public gist"
//   4. Click "Raw" and copy that URL → paste it below as MANIFEST_URL
//
// RELEASING AN UPDATE:
//   1. Bump version in package.json (e.g. 0.1.4)
//   2. npm run package  →  builds the installer
//   3. Upload the .exe wherever you share it (Google Drive, Discord, etc.)
//   4. Edit your Gist — update "version" and "downloadUrl"
//   5. Done — the app will notify users within 2 hours
//
// Gist contents (update these values when you release):
// {
//   "version": "0.1.8",
//   "notes": "In-app updates, friends tab",
//   "downloadUrl": "https://YOUR_DOWNLOAD_LINK_HERE"
// }
//
const MANIFEST_URL = 'https://gist.githubusercontent.com/Sxarlos/09584c4f095954f7d39e93ae6d55b268/raw/latest-version.json'

// Re-check every 5 minutes while the app is open
const RECHECK_INTERVAL_MS = 5 * 60 * 1000

function semverGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff > 0) return true
    if (diff < 0) return false
  }
  return false
}

async function fetchManifest(): Promise<UpdateInfo | null> {
  if ((MANIFEST_URL as string) === 'PASTE_YOUR_GIST_RAW_URL_HERE') return null
  try {
    const res = await net.fetch(MANIFEST_URL, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'EnderClient-Updater' }
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<UpdateInfo>
    if (!data.version || !data.downloadUrl) return null
    return { version: data.version, notes: data.notes, downloadUrl: data.downloadUrl }
  } catch {
    return null
  }
}

function broadcast(info: UpdateInfo): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:available', info)
  }
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const manifest = await fetchManifest()
  if (manifest && semverGt(manifest.version, app.getVersion())) {
    broadcast(manifest)
    return manifest
  }
  return null
}

export function openDownloadUrl(url: string): void {
  shell.openExternal(url)
}

function broadcastProgress(percent: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:download-progress', percent)
  }
}

// Google Drive share links don't serve files directly. Convert them to the
// direct-download format with confirm=t which bypasses the virus-scan warning page.
function resolveDownloadUrl(url: string): string {
  const fileId =
    url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)?.[1] ??
    url.match(/drive\.google\.com\/open\?.*[?&]id=([^&]+)/)?.[1] ??
    (!url.includes('confirm=') ? url.match(/drive\.google\.com\/uc\?.*[?&]id=([^&]+)/)?.[1] : null)
  if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`
  return url
}

export async function downloadUpdate(url: string): Promise<string> {
  const dest = join(tmpdir(), 'EnderClientSetup.exe')
  const resolvedUrl = resolveDownloadUrl(url)

  // Use Electron's net.fetch (Chromium networking) so Google Drive cookies,
  // redirects and TLS quirks are handled automatically.
  const res = await net.fetch(resolvedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })

  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)

  const total = parseInt(res.headers.get('content-length') ?? '0', 10)
  let received = 0

  const file = createWriteStream(dest)
  const reader = res.body!.getReader()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      file.write(Buffer.from(value!))
      received += value!.length
      if (total > 0) broadcastProgress(Math.round((received / total) * 100))
    }
  } catch (e) {
    reader.cancel()
    file.destroy()
    throw e
  }

  await new Promise<void>((resolve, reject) => {
    file.end()
    file.on('finish', resolve)
    file.on('error', reject)
  })

  broadcastProgress(100)
  return dest
}

export function installAndRestart(installerPath: string): void {
  shell.openPath(installerPath)
  setTimeout(() => app.quit(), 800)
}

/** Call once after the window is ready. Checks now then on a timer. */
export function startUpdateChecker(): void {
  setTimeout(async () => {
    await checkForUpdate()
    setInterval(checkForUpdate, RECHECK_INTERVAL_MS)
  }, 5000)
}
