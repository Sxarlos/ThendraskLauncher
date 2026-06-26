import { app, BrowserWindow, shell } from 'electron'
import type { UpdateInfo } from '@shared/types'

// ── UPDATE MANIFEST URL ───────────────────────────────────────────────────────
// Point this at a JSON file you control and push to when you release.
// The file must be JSON with at least: { "version": "x.y.z", "downloadUrl": "..." }
// Optional field: "notes" (short release description shown in the launcher).
//
// Easiest setup — create this file in your GitHub repo and update it on release:
//   https://raw.githubusercontent.com/YOUR_USERNAME/ender-client/main/latest-version.json
//
// Example file contents:
//   { "version": "1.1.0", "notes": "Bug fixes, improved modpack loading", "downloadUrl": "https://..." }
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/YOUR_USERNAME/ender-client/main/latest-version.json'

// Check again every 2 hours while the app is open
const RECHECK_INTERVAL_MS = 2 * 60 * 60 * 1000

function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff > 0) return true
    if (diff < 0) return false
  }
  return false
}

async function fetchManifest(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(UPDATE_MANIFEST_URL, {
      headers: { 'Cache-Control': 'no-cache' }
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

/** Call once after the window is ready. Checks now and then on a timer. */
export function startUpdateChecker(): void {
  // Delay first check by 5s so it doesn't slow startup
  setTimeout(async () => {
    await checkForUpdate()
    setInterval(checkForUpdate, RECHECK_INTERVAL_MS)
  }, 5000)
}
