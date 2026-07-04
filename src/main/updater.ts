import { app, BrowserWindow, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { getSettings } from './settings'
import type { UpdateInfo } from '@shared/types'

// ── AUTO-UPDATE (electron-updater) ──────────────────────────────────────────
// Cross-platform self-update backed by electron-updater. The launcher publishes
// per-platform installers plus the electron-updater metadata (latest.yml /
// latest-mac.yml / latest-linux.yml) to its GitHub Releases; electron-updater
// picks the correct artifact for the running OS/arch and verifies it against the
// sha512 recorded in that metadata — so there is no manual asset-name matching
// or magic-byte check here anymore.
//
//   Windows (NSIS) : downloads + runs the installer, then relaunches.
//   Linux (AppImage): downloads + swaps the AppImage, then relaunches.
//   macOS (zip)     : downloads via Squirrel.Mac. NOTE — Squirrel.Mac only
//                     *applies* an update when the app is code-signed; on the
//                     unsigned builds the banner/download still work but the
//                     final apply is a no-op until signing is added.
//
// RELEASING AN UPDATE:
//   1. Bump version in package.json
//   2. Commit and push to main
//   3. git tag vX.Y.Z && git push origin vX.Y.Z
//   4. CI builds on windows/macos/ubuntu and runs `electron-builder --publish
//      always`, uploading every platform's artifacts + *.yml to one GitHub
//      Release. Users see the update banner within ~5 minutes.

const { autoUpdater } = electronUpdater

const REPO = 'Sxarlos/ThendraskLauncher'

// Re-check every 5 minutes while the app is open
const RECHECK_INTERVAL_MS = 5 * 60 * 1000

// We let the user drive download/install from the banner, matching the old UX.
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

// The most recent update electron-updater told us about. The renderer can only
// ever trigger a download/install of what the main process itself resolved.
let latest: UpdateInfo | null = null
// electron-updater's own verdict from the last check — more reliable than a
// hand-rolled semver compare, and it correctly orders prerelease (beta) tags.
let updateIsAvailable = false

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function firstLine(text: string): string | undefined {
  return text
    .split('\n')
    .map((l) => l.replace(/<[^>]+>/g, '').trim())
    .find((l) => l.length > 0)
}

interface RawReleaseNote {
  note?: string | null
}

function toAppInfo(info: { version: string; releaseNotes?: string | RawReleaseNote[] | null }): UpdateInfo {
  let notes: string | undefined
  const rn = info.releaseNotes
  if (typeof rn === 'string') {
    notes = firstLine(rn)
  } else if (Array.isArray(rn)) {
    notes = firstLine(rn.map((n) => n?.note ?? '').join('\n'))
  }
  return {
    version: info.version,
    notes,
    // Used only as a fallback "open in browser" link — the actual download is
    // handled internally by electron-updater, not via this URL.
    downloadUrl: `https://github.com/${REPO}/releases/tag/v${info.version}`
  }
}

autoUpdater.on('update-available', (info) => {
  updateIsAvailable = true
  latest = toAppInfo(info)
  broadcast('update:available', latest)
})

autoUpdater.on('update-not-available', () => {
  updateIsAvailable = false
})

autoUpdater.on('download-progress', (p) => {
  broadcast('update:download-progress', Math.round(p.percent))
})

autoUpdater.on('update-downloaded', () => {
  broadcast('update:download-progress', 100)
})

autoUpdater.on('error', (err) => {
  console.warn('[updater]', err instanceof Error ? err.message : err)
})

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  // electron-updater cannot meaningfully check in an unpackaged dev build.
  if (!app.isPackaged) return null
  try {
    await autoUpdater.checkForUpdates()
    // Resolved by the 'update-available' / 'update-not-available' handlers that
    // fire during the check — this respects the beta/stable channel and orders
    // prerelease tags correctly.
    return updateIsAvailable ? latest : null
  } catch (err) {
    console.warn('[updater] check failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export function openDownloadUrl(url: string): void {
  if (!/^https:\/\//.test(url)) throw new Error('Refusing to open non-https download URL.')
  shell.openExternal(url)
}

export async function downloadUpdate(_url: string): Promise<string> {
  if (!latest) throw new Error('No published update is available to download.')
  await autoUpdater.downloadUpdate()
  broadcast('update:download-progress', 100)
  // The renderer only needs a truthy handle to enable the "Install" button.
  return latest.version
}

export function installAndRestart(_path: string): void {
  // electron-updater knows which artifact it downloaded; quit and apply it.
  autoUpdater.quitAndInstall()
}

/**
 * Opt in/out of prerelease (beta) updates at runtime. When enabled, the checker
 * also offers GitHub *prereleases*; when disabled it only offers full releases.
 * Safe to call before or after the checker has started.
 */
export function setBetaUpdates(enabled: boolean): void {
  autoUpdater.allowPrerelease = enabled
}

/** Call once after the window is ready. Checks now then on a timer. */
export function startUpdateChecker(): void {
  if (!app.isPackaged) return
  autoUpdater.allowPrerelease = !!getSettings().betaUpdates
  setTimeout(() => {
    void checkForUpdate()
    setInterval(() => void checkForUpdate(), RECHECK_INTERVAL_MS)
  }, 5000)
}
