import { app, BrowserWindow, shell, net } from 'electron'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { UpdateInfo } from '@shared/types'

// ── UPDATE MANIFEST ───────────────────────────────────────────────────────────
// A public GitHub Gist holds the latest version info. CI patches it automatically
// on every tagged release — no manual editing needed after initial setup.
//
// RELEASING AN UPDATE:
//   1. Bump version in package.json
//   2. Commit and push to main
//   3. git tag vX.Y.Z && git push origin vX.Y.Z
//   4. CI builds the installer, creates a GitHub Release, and patches the Gist.
//      Users see the update banner within ~5 minutes.
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

async function gdriveFetch(fetchUrl: string): Promise<Response> {
  const res = await net.fetch(fetchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  return res
}

export async function downloadUpdate(url: string): Promise<string> {
  const dest = join(tmpdir(), 'EnderClientSetup.exe')
  const resolvedUrl = resolveDownloadUrl(url)

  let res = await gdriveFetch(resolvedUrl)

  // Google Drive returns an HTML "too large to virus-scan" warning page for big files.
  // The confirm=t shortcut no longer works reliably — extract the real token from the page.
  if ((res.headers.get('content-type') ?? '').includes('text/html')) {
    const html = await res.text()
    const match = html.match(/confirm=([^&"'\s]+)/)
    if (!match) {
      throw new Error(
        'Download failed: received an HTML page instead of the installer. ' +
        'Make sure the Google Drive file is shared publicly ("Anyone with the link").'
      )
    }
    const confirmUrl = resolvedUrl.replace(/\bconfirm=[^&]+/, `confirm=${match[1]}`)
    res = await gdriveFetch(confirmUrl)
  }

  const total = parseInt(res.headers.get('content-length') ?? '0', 10)
  let received = 0
  let checkedHeader = false

  const file = createWriteStream(dest)
  const reader = res.body!.getReader()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // First chunk must start with MZ — the Windows PE magic bytes.
      // If it doesn't, the download returned bad content (HTML, redirect page, etc.).
      if (!checkedHeader && value && value.length >= 2) {
        checkedHeader = true
        if (value[0] !== 0x4D || value[1] !== 0x5A) {
          reader.cancel()
          file.destroy()
          throw new Error(
            'Download failed: the file is not a valid Windows executable. ' +
            'Check that the download URL points directly to the installer.'
          )
        }
      }
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
