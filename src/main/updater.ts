import { app, BrowserWindow, shell } from 'electron'
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
//   1. Bump version in package.json (e.g. 0.1.2)
//   2. npm run package  →  builds the installer
//   3. Upload the .exe wherever you share it (Google Drive, Discord, etc.)
//   4. Edit your Gist — update "version" and "downloadUrl"
//   5. Done — the app will notify users within 2 hours
//
// Gist contents (update these values when you release):
// {
//   "version": "0.1.2",
//   "notes": "Fixed CurseForge API key issues and launcher version display",
//   "downloadUrl": "https://YOUR_DOWNLOAD_LINK_HERE"
// }
//
const MANIFEST_URL = 'https://gist.githubusercontent.com/Sxarlos/09584c4f095954f7d39e93ae6d55b268/raw/eb0955e8985bd4c5cc1bff3e9be7afcdfce24e01/latest-version.json'

// Re-check every 2 hours while the app is open
const RECHECK_INTERVAL_MS = 2 * 60 * 60 * 1000

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
  if (MANIFEST_URL === 'PASTE_YOUR_GIST_RAW_URL_HERE') return null
  try {
    const res = await fetch(MANIFEST_URL, {
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

/** Call once after the window is ready. Checks now then on a timer. */
export function startUpdateChecker(): void {
  setTimeout(async () => {
    await checkForUpdate()
    setInterval(checkForUpdate, RECHECK_INTERVAL_MS)
  }, 5000)
}
