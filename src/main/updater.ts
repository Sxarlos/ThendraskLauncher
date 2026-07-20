import { app, BrowserWindow, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { getSettings } from './settings'
import { runningInstanceIds } from './launcher'
import type { UpdateInfo } from '@shared/types'

// ── AUTO-UPDATE (electron-updater) ──────────────────────────────────────────
// Cross-platform self-update backed by electron-updater. The launcher publishes
// per-platform installers plus the electron-updater metadata (latest.yml /
// latest-mac.yml / latest-linux.yml) to its GitHub Releases; electron-updater
// picks the correct artifact for the running OS/arch and verifies it against the
// sha512 recorded in that metadata, so there is no manual asset-name matching
// or magic-byte check here anymore.
//
//   Windows (NSIS) : downloads + runs the installer, then relaunches.
//   Linux (AppImage): downloads + swaps the AppImage, then relaunches.
//   macOS (zip)     : downloads via Squirrel.Mac. NOTE: Squirrel.Mac only
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

// Downloads are silent and automatic (Discord/VS Code style): when a check
// finds an update we immediately fetch it in the background, and the renderer
// only has to surface "restart to update" once it's ready. autoDownload stays
// false so all downloads funnel through the guarded startBackgroundDownload().
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

// The most recent update electron-updater told us about. The renderer can only
// ever trigger a download/install of what the main process itself resolved.
let latest: UpdateInfo | null = null
// electron-updater's own verdict from the last check, which is more reliable than a
// hand-rolled semver compare, and it correctly orders prerelease (beta) tags.
let updateIsAvailable = false
// Versions we are downloading / have finished downloading, so periodic
// re-checks (update-available fires on every one) don't restart the download.
let downloadingVersion: string | null = null
let readyVersion: string | null = null

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
    // Used only as a fallback "open in browser" link; the actual download is
    // handled internally by electron-updater, not via this URL.
    downloadUrl: `https://github.com/${REPO}/releases/tag/v${info.version}`
  }
}

autoUpdater.on('update-available', (info) => {
  updateIsAvailable = true
  latest = toAppInfo(info)
  if (readyVersion === info.version) {
    // Already downloaded on an earlier check this session; just remind the
    // renderer it can restart, don't kick off another download.
    broadcast('update:ready', latest)
    return
  }
  // Silent download unless the user opted out in Settings. Started before the
  // 'update:available' broadcast so the renderer is already in 'downloading'
  // when it learns about the update and never flashes the manual Download UI.
  if (getSettings().autoDownloadUpdates !== false) void startBackgroundDownload()
  broadcast('update:available', latest)
})

autoUpdater.on('update-not-available', () => {
  updateIsAvailable = false
})

autoUpdater.on('download-progress', (p) => {
  broadcast('update:download-progress', Math.round(p.percent))
})

autoUpdater.on('update-downloaded', (info) => {
  downloadingVersion = null
  readyVersion = info.version
  broadcast('update:ready', toAppInfo(info))
})

autoUpdater.on('error', (err) => {
  console.warn('[updater]', err instanceof Error ? err.message : err)
  broadcast('update:error', err instanceof Error ? err.message : String(err))
})

/**
 * Fetch the update silently in the background. Guarded so the automatic path
 * (every successful check re-fires 'update-available') and the renderer's
 * Retry button can't start overlapping downloads. Never throws; failures are
 * broadcast as 'update:error' by the autoUpdater error handler above.
 */
async function startBackgroundDownload(): Promise<void> {
  if (!latest) return
  if (downloadingVersion === latest.version || readyVersion === latest.version) return
  downloadingVersion = latest.version
  // Synchronous with the caller; flips the renderer into 'downloading' state.
  broadcast('update:download-progress', 0)
  try {
    await autoUpdater.downloadUpdate()
  } catch {
    // Reported via the 'error' event; clear the guard so a retry can start.
    downloadingVersion = null
  }
}

/**
 * Kick off the silent download for an update we already know about. Used when
 * the user re-enables auto-download in Settings. No-op if nothing is pending
 * or the download already ran.
 */
export function downloadPendingUpdate(): void {
  if (updateIsAvailable) void startBackgroundDownload()
}

/**
 * @param notify Broadcast 'update:checking' / 'update:up-to-date' so the
 * renderer can show a transient "Checking for updates…" toast. Only the
 * startup check notifies. The 5-minute re-checks and the Settings-page manual
 * check (which renders its own inline status) stay silent.
 */
export async function checkForUpdate(notify = false): Promise<UpdateInfo | null> {
  // electron-updater cannot meaningfully check in an unpackaged dev build.
  if (!app.isPackaged) return null
  if (notify) broadcast('update:checking', null)
  try {
    await autoUpdater.checkForUpdates()
    // Resolved by the 'update-available' / 'update-not-available' handlers that
    // fire during the check. This respects the beta/stable channel and orders
    // prerelease tags correctly.
    if (notify && !updateIsAvailable) broadcast('update:up-to-date', null)
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

/**
 * Renderer-initiated download, now only the Retry path since downloads start
 * automatically when an update is found. Completion/failure reach the renderer
 * via the 'update:ready' / 'update:error' broadcasts, not this return value.
 */
export async function downloadUpdate(_url: string): Promise<string> {
  if (!latest) throw new Error('No published update is available to download.')
  await startBackgroundDownload()
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
    // Only the startup check shows the "Checking for updates…" toast.
    void checkForUpdate(true)
    // Skip periodic re-checks while a game is running; no point spending
    // network/CPU on a background check the user can't act on right now.
    setInterval(() => {
      if (runningInstanceIds().length === 0) void checkForUpdate()
    }, RECHECK_INTERVAL_MS)
  }, 5000)
}
