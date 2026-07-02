import { app, BrowserWindow, shell, net } from 'electron'
import { createWriteStream, unlinkSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { tmpdir } from 'os'
import { semverGt } from './semver'
import type { UpdateInfo } from '@shared/types'

// ── UPDATE CHECK ──────────────────────────────────────────────────────────────
// Checks the GitHub Releases API — no token or extra secrets needed since the
// repo's releases are public. CI creates a release automatically on tag push.
//
// RELEASING AN UPDATE:
//   1. Bump version in package.json
//   2. Commit and push to main
//   3. git tag vX.Y.Z && git push origin vX.Y.Z
//   4. CI builds the installer, uploads it plus a .sha256 checksum asset, and
//      creates a GitHub Release. Users see the update banner within ~5 minutes.
//
const RELEASES_API = 'https://api.github.com/repos/Sxarlos/ThendraskLauncher/releases/latest'

// Re-check every 5 minutes while the app is open
const RECHECK_INTERVAL_MS = 5 * 60 * 1000

interface Manifest {
  info: UpdateInfo
  /** URL of the CI-published "<installer>.sha256" asset, when present. */
  sha256Url?: string
}

// The manifest we last saw and the installer we last downloaded. The IPC layer
// only ever downloads/installs what the main process itself resolved — the
// renderer cannot point us at an arbitrary URL or executable.
let latestManifest: Manifest | null = null
let lastDownloadedPath: string | null = null

async function fetchManifest(): Promise<Manifest | null> {
  try {
    const res = await net.fetch(RELEASES_API, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ThendraskLauncher-Updater',
        'Cache-Control': 'no-cache'
      }
    })
    if (!res.ok) return null
    const data = await res.json() as any
    const version = (data.tag_name as string | undefined)?.replace(/^v/, '')
    if (!version) return null
    const assets = (data.assets as any[] | undefined) ?? []
    const exe = assets.find((a: any) => typeof a.name === 'string' && a.name.endsWith('.exe'))
    if (!exe?.browser_download_url) return null
    const sha = assets.find((a: any) => a.name === `${exe.name}.sha256`)
    const firstNoteLine = (data.body as string | undefined)
      ?.split('\n').map((l: string) => l.trim()).find((l: string) => l.length > 0)
    return {
      info: {
        version,
        notes: firstNoteLine,
        downloadUrl: exe.browser_download_url as string
      },
      sha256Url: sha?.browser_download_url as string | undefined
    }
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
  if (manifest && semverGt(manifest.info.version, app.getVersion())) {
    latestManifest = manifest
    broadcast(manifest.info)
    return manifest.info
  }
  return null
}

export function openDownloadUrl(url: string): void {
  if (!/^https:\/\//.test(url)) throw new Error('Refusing to open non-https download URL.')
  shell.openExternal(url)
}

function broadcastProgress(percent: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:download-progress', percent)
  }
}

/** Fetch the expected installer hash from the release's .sha256 asset (format: "<hex> filename"). */
async function fetchExpectedSha256(url: string): Promise<string | null> {
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': 'ThendraskLauncher-Updater' } })
    if (!res.ok) return null
    const text = await res.text()
    const hex = text.trim().split(/\s+/)[0]?.toLowerCase()
    return hex && /^[0-9a-f]{64}$/.test(hex) ? hex : null
  } catch {
    return null
  }
}

export async function downloadUpdate(url: string): Promise<string> {
  // Only download the installer we discovered ourselves via the releases API.
  if (!latestManifest || url !== latestManifest.info.downloadUrl) {
    throw new Error('Refusing to download: URL does not match the published release.')
  }

  const dest = join(tmpdir(), 'ThendraskLauncherSetup.exe')
  const res = await net.fetch(url, {
    headers: { 'User-Agent': 'ThendraskLauncher-Updater' }
  })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)

  const total = parseInt(res.headers.get('content-length') ?? '0', 10)
  let received = 0
  let checkedHeader = false

  const hash = createHash('sha256')
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
          throw new Error(
            'Download failed: the file is not a valid Windows executable. ' +
            'Check that the download URL points directly to the installer.'
          )
        }
      }
      const chunk = Buffer.from(value!)
      hash.update(chunk)
      file.write(chunk)
      received += chunk.length
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

  // Verify the installer against the CI-published checksum. Releases made
  // before checksums were introduced simply don't have the asset — skip then.
  if (latestManifest.sha256Url) {
    const expected = await fetchExpectedSha256(latestManifest.sha256Url)
    if (expected) {
      const actual = hash.digest('hex')
      if (actual !== expected) {
        try { unlinkSync(dest) } catch { /* best effort */ }
        throw new Error(
          'Download failed integrity check: the installer does not match the published SHA-256. ' +
          'The download may be corrupted or tampered with — try again later.'
        )
      }
    } else {
      console.warn('[updater] Could not fetch the published SHA-256 — skipping verification.')
    }
  } else {
    console.warn('[updater] Release has no .sha256 asset — skipping verification.')
  }

  broadcastProgress(100)
  lastDownloadedPath = dest
  return dest
}

export function installAndRestart(installerPath: string): void {
  // Only run the installer this process downloaded and verified.
  if (!lastDownloadedPath || installerPath !== lastDownloadedPath) {
    throw new Error('Refusing to run: installer path does not match the verified download.')
  }
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
