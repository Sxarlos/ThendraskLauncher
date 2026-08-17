/**
 * Modpack installation: downloads mod files and determines the correct loader version.
 * Called from launcher.ts during the 'preparing' phase on first launch (or after a version switch).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { instanceGameDir } from './instances'
import { safeJoin } from './safePath'
import { validateArchiveEntries } from './archiveSafety'
import type { MissingCurseForgeFile } from '@shared/types'
import { assertCurseForgeEnabled } from './curseforgePolicy'
import { curseForgeFetch } from './curseforgeApi'
import {
  PRISM_PROFILE_FILE,
  findPrismIconDataUrl,
  findPrismRoot,
  mergePrismComponents,
  parseInstanceCfg,
  type PrismComponent,
  type PrismComponentRef
} from './prism'

const MR_BASE = 'https://api.modrinth.com/v2'
const CF_BASE = 'https://api.curseforge.com/v1'
const UA = 'thendrask-launcher (github.com/Sxarlos/ThendraskLauncher)'

type CurseForgeInstallDirectory = NonNullable<MissingCurseForgeFile['installDirectory']>

/** Map Minecraft's CurseForge project classes to their runtime directories. */
export function curseForgeInstallDirectory(classId: number | undefined): CurseForgeInstallDirectory {
  if (classId === 12) return 'resourcepacks'
  if (classId === 6552) return 'shaderpacks'
  if (classId === 6945) return 'config/paxi/datapacks'
  return 'mods'
}

async function fetchCurseForgeProjects(projectIds: number[]): Promise<Map<number, any>> {
  const projectsById = new Map<number, any>()
  const uniqueIds = [...new Set(projectIds.filter(Number.isSafeInteger))]
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const res = await curseForgeFetch(`${CF_BASE}/mods`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ modIds: uniqueIds.slice(i, i + 50) })
    })
    if (!res.ok) throw new Error(`CurseForge ${res.status} while classifying pack files`)
    const projects = ((await res.json() as any).data as any[]) ?? []
    for (const project of projects) projectsById.set(Number(project.id), project)
  }
  return projectsById
}

function curseForgeDestination(
  gameDir: string,
  fileName: string,
  installDirectory: CurseForgeInstallDirectory
): string {
  const dest = safeJoin(gameDir, `${installDirectory}/${fileName}`)
  if (!dest) throw new Error(`Unsafe CurseForge file name: ${fileName}`)
  mkdirSync(dirname(dest), { recursive: true })
  return dest
}

export function curseForgeInstallPath(
  instanceId: string,
  fileName: string,
  installDirectory: MissingCurseForgeFile['installDirectory']
): string {
  return curseForgeDestination(instanceGameDir(instanceId), fileName, installDirectory ?? 'mods')
}

function openValidatedZip(input: string | Buffer, label = 'Modpack'): AdmZip {
  const zip = new AdmZip(input)
  validateArchiveEntries(zip.getEntries(), label)
  return zip
}

function verifyPackFile(path: string, hashes?: Record<string, string>): void {
  const expected = hashes?.sha512 ?? hashes?.sha1
  const algorithm = hashes?.sha512 ? 'sha512' : hashes?.sha1 ? 'sha1' : null
  if (!expected || !algorithm) return
  const actual = createHash(algorithm).update(readFileSync(path)).digest('hex')
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    rmSync(path, { force: true })
    throw new Error(`Checksum verification failed for ${path}`)
  }
}

function curseForgeHashes(file: any): MissingCurseForgeFile['hashes'] {
  const hashes = Array.isArray(file?.hashes) ? file.hashes : []
  const sha1 = hashes.find((hash: any) => Number(hash?.algo) === 1)?.value
  const md5 = hashes.find((hash: any) => Number(hash?.algo) === 2)?.value
  if (typeof sha1 !== 'string' && typeof md5 !== 'string') return undefined
  return {
    sha1: typeof sha1 === 'string' ? sha1 : undefined,
    md5: typeof md5 === 'string' ? md5 : undefined
  }
}

/** Validate a user-selected restricted CurseForge file without modifying it. */
export function verifyCurseForgeManualFile(
  path: string,
  file: Pick<MissingCurseForgeFile, 'displayName' | 'fileName' | 'hashes'>
): void {
  const expected = file.hashes?.sha1 ?? file.hashes?.md5
  const algorithm = file.hashes?.sha1 ? 'sha1' : file.hashes?.md5 ? 'md5' : null
  if (!expected || !algorithm) return
  const actual = createHash(algorithm).update(readFileSync(path)).digest('hex')
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `${file.fileName ?? file.displayName} did not match CurseForge's ${algorithm.toUpperCase()} checksum. ` +
      'Download the exact required file from the official CurseForge page and try again.'
    )
  }
}

export async function verifyMissingCurseForgeFile(
  instanceId: string,
  projectId: number,
  fileId: number,
  sourcePath: string
): Promise<MissingCurseForgeFile> {
  const marker = readMarker(instanceId)
  if (!marker) throw new Error('This instance does not have modpack metadata.')
  const match = (marker.missingCurseForgeFiles ?? [])
    .find((file) => file.projectId === projectId && file.fileId === fileId)
  if (!match) throw new Error('This manual file is no longer in the instance checklist.')

  // Checklists created by older beta builds predate stored checksums. Refresh
  // just this file's official metadata so those instances gain verification
  // without forcing the user to reinstall the whole pack.
  let markerChanged = false
  if (!match.hashes?.sha1 && !match.hashes?.md5) {
    try {
      const res = await curseForgeFetch(`${CF_BASE}/mods/${projectId}/files/${fileId}`)
      if (res.ok) {
        const data = (await res.json() as any).data
        match.hashes = curseForgeHashes(data)
        match.fileName ??= typeof data?.fileName === 'string' ? data.fileName : undefined
        markerChanged = !!match.hashes || !!match.fileName
      }
    } catch {
      // Exact-filename validation remains available if metadata is temporarily
      // unavailable or CurseForge does not supply a checksum.
    }
  }
  if (!match.installDirectory) {
    try {
      const projectRes = await curseForgeFetch(`${CF_BASE}/mods/${projectId}`)
      if (projectRes.ok) {
        const project = (await projectRes.json() as any).data
        match.installDirectory = curseForgeInstallDirectory(Number(project?.classId))
        markerChanged = true
      }
    } catch {
      // Older checklists can still fall back to mods if project metadata is
      // temporarily unavailable.
    }
  }
  if (markerChanged) writeMarker(instanceId, marker)
  verifyCurseForgeManualFile(sourcePath, match)
  return match
}

// ── Marker file ───────────────────────────────────────────────────────────────
// Written after a successful install so we don't re-download on every launch.

export interface PackMarker {
  packVersionId?: string
  loaderType: string       // 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'vanilla'
  loaderVersion?: string   // e.g. '0.16.5' for Fabric, '47.2.0' for Forge
  missingCurseForgeFiles?: MissingCurseForgeFile[]
  curseForgeImport?: {
    name: string
    version?: string
    sourceFileName?: string
  }
}

function markerPath(instanceId: string): string {
  return join(instanceGameDir(instanceId), '.ender-pack.json')
}

export function readMarker(instanceId: string): PackMarker | null {
  try {
    const p = markerPath(instanceId)
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
  } catch {
    return null
  }
}

function writeMarker(instanceId: string, m: PackMarker): void {
  writeFileSync(markerPath(instanceId), JSON.stringify(m, null, 2))
}

export function listMissingCurseForgeFiles(instanceId: string): MissingCurseForgeFile[] {
  return readMarker(instanceId)?.missingCurseForgeFiles ?? []
}

export function markCurseForgeFileImported(
  instanceId: string,
  projectId: number,
  fileId: number,
  importedFileName: string
): MissingCurseForgeFile[] {
  const marker = readMarker(instanceId)
  if (!marker) throw new Error('This instance does not have modpack metadata.')
  const files = marker.missingCurseForgeFiles ?? []
  const match = files.find((file) => file.projectId === projectId && file.fileId === fileId)
  if (!match) throw new Error('This manual file is no longer in the instance checklist.')
  match.importedFileName = importedFileName
  writeMarker(instanceId, marker)
  return files
}

export function invalidateMarker(instanceId: string): void {
  rmSync(markerPath(instanceId), { force: true })
}

// ── Loader version resolution ─────────────────────────────────────────────────

export async function resolveFabricVersion(mcVersion: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`)
    if (!res.ok) return undefined
    const data = await res.json() as any[]
    const stable = data.find((e) => e.loader?.stable)
    return (stable ?? data[0])?.loader?.version
  } catch {
    return undefined
  }
}

export async function resolveQuiltVersion(mcVersion: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`)
    if (!res.ok) return undefined
    const data = await res.json() as any[]
    return data[0]?.version
  } catch {
    return undefined
  }
}

/**
 * Installs the Fabric loader profile into the instance's versions/ folder
 * so MCLC can use it via the `custom` parameter.
 * Returns the installed version ID string.
 */
export async function installFabricLoader(
  gameDir: string,
  mcVersion: string,
  loaderVersion: string
): Promise<string> {
  const versionId = `fabric-loader-${loaderVersion}-${mcVersion}`
  const vDir = join(gameDir, 'versions', versionId)
  const vJson = join(vDir, `${versionId}.json`)

  if (existsSync(vJson)) return versionId

  mkdirSync(vDir, { recursive: true })

  const url = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download Fabric profile: ${res.status}`)
  writeFileSync(vJson, Buffer.from(await res.arrayBuffer()))

  return versionId
}

/**
 * Installs the Quilt loader profile into the instance's versions/ folder
 * so MCLC can use it via the `custom` parameter.
 * Returns the installed version ID string.
 */
export async function installQuiltLoader(
  gameDir: string,
  mcVersion: string,
  loaderVersion: string
): Promise<string> {
  const versionId = `quilt-loader-${loaderVersion}-${mcVersion}`
  const vDir = join(gameDir, 'versions', versionId)
  const vJson = join(vDir, `${versionId}.json`)

  if (existsSync(vJson)) return versionId

  mkdirSync(vDir, { recursive: true })

  const url = `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download Quilt profile: ${res.status}`)
  writeFileSync(vJson, Buffer.from(await res.arrayBuffer()))

  return versionId
}

export async function resolveForgeVersion(mcVersion: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')
    if (!res.ok) return undefined
    const data = await res.json() as { promos: Record<string, string> }
    return data.promos[`${mcVersion}-recommended`] ?? data.promos[`${mcVersion}-latest`]
  } catch {
    return undefined
  }
}

export async function resolveNeoforgeVersion(mcVersion: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')
    if (!res.ok) return undefined
    const xml = await res.text()
    const versions = [...xml.matchAll(/<version>([\d.]+)<\/version>/g)].map((m) => m[1])
    // MC 1.X.Y → NeoForge X.Y.* (e.g. 1.21.1 → 21.1.*)
    const match = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?$/)
    if (!match) return undefined
    const prefix = match[2] ? `${match[1]}.${match[2]}.` : `${match[1]}.`
    const matching = versions.filter((v) => v.startsWith(prefix))
    return matching[matching.length - 1]
  } catch {
    return undefined
  }
}

/**
 * Returns a list of available loader versions for the given loader + MC version combination.
 * Used by the New Instance modal to let users pick a specific loader version.
 * Returns versions newest-first; the first entry is the recommended default.
 */
export async function listLoaderVersions(loader: string, mcVersion: string): Promise<string[]> {
  if (loader === 'fabric') {
    try {
      const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`)
      if (!res.ok) return []
      const data = await res.json() as { loader: { version: string; stable: boolean } }[]
      // Stable versions first, then unstable, capped at 20
      const stable = data.filter((e) => e.loader.stable).map((e) => e.loader.version)
      const unstable = data.filter((e) => !e.loader.stable).map((e) => e.loader.version)
      return [...stable, ...unstable].slice(0, 20)
    } catch {
      return []
    }
  }

  if (loader === 'quilt') {
    try {
      const res = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`)
      if (!res.ok) return []
      const data = await res.json() as { version: string }[]
      return data.map((e) => e.version).slice(0, 20)
    } catch {
      return []
    }
  }

  if (loader === 'forge') {
    try {
      const res = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')
      if (!res.ok) return []
      const data = await res.json() as { promos: Record<string, string> }
      const recommended = data.promos[`${mcVersion}-recommended`]
      const latest = data.promos[`${mcVersion}-latest`]
      const seen = new Set<string>()
      const result: string[] = []
      for (const v of [recommended, latest]) {
        if (v && !seen.has(v)) { seen.add(v); result.push(v) }
      }
      return result
    } catch {
      return []
    }
  }

  if (loader === 'neoforge') {
    try {
      const res = await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml')
      if (!res.ok) return []
      const xml = await res.text()
      const versions = [...xml.matchAll(/<version>([\d.]+)<\/version>/g)].map((m) => m[1])
      const match = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?$/)
      if (!match) return []
      const prefix = match[2] ? `${match[1]}.${match[2]}.` : `${match[1]}.`
      const matching = versions.filter((v) => v.startsWith(prefix))
      return matching.slice().reverse().slice(0, 15)
    } catch {
      return []
    }
  }

  return []
}

/**
 * Downloads the Forge installer JAR into the instance's .ender-installers/ cache.
 * Returns the JAR path for MCLC's `forge:` option; ForgeWrapper handles the rest.
 */
export async function installForgeLoader(
  gameDir: string,
  mcVersion: string,
  forgeVersion: string
): Promise<string> {
  const installersDir = join(gameDir, '.ender-installers')
  mkdirSync(installersDir, { recursive: true })
  const installerPath = join(installersDir, `forge-${mcVersion}-${forgeVersion}-installer.jar`)

  if (!existsSync(installerPath)) {
    const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`Failed to download Forge installer: ${res.status}`)
    writeFileSync(installerPath, Buffer.from(await res.arrayBuffer()))
  }

  return installerPath
}

/**
 * Downloads the NeoForge installer JAR into the instance's .ender-installers/ cache.
 * Returns the JAR path for MCLC's `forge:` option; ForgeWrapper handles the rest.
 */
export async function installNeoforgeLoader(
  gameDir: string,
  neoforgeVersion: string
): Promise<string> {
  const installersDir = join(gameDir, '.ender-installers')
  mkdirSync(installersDir, { recursive: true })
  const installerPath = join(installersDir, `neoforge-${neoforgeVersion}-installer.jar`)

  if (!existsSync(installerPath)) {
    const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`Failed to download NeoForge installer: ${res.status}`)
    writeFileSync(installerPath, Buffer.from(await res.arrayBuffer()))
  }

  return installerPath
}

/**
 * Runs the NeoForge installer JAR to create a proper version profile in the instance's game dir.
 * More reliable than MCLC's ForgeWrapper for NeoForge 20.4+ which changed its installer format.
 * Returns the version profile ID string for use as MCLC's `custom` option.
 */
export async function installNeoforgeProfile(
  gameDir: string,
  neoforgeVersion: string,
  javaExecutable: string,
  onProgress: (msg: string) => void,
  onLog?: (line: string) => void
): Promise<string> {
  const versionId = `neoforge-${neoforgeVersion}`
  const versionJson = join(gameDir, 'versions', versionId, `${versionId}.json`)

  if (existsSync(versionJson)) return versionId

  // NeoForge installer checks for launcher_profiles.json and aborts if absent.
  // Write a minimal stub so it proceeds; the file is harmless to leave in place.
  const launcherProfiles = join(gameDir, 'launcher_profiles.json')
  if (!existsSync(launcherProfiles)) {
    mkdirSync(gameDir, { recursive: true })
    writeFileSync(launcherProfiles, JSON.stringify({
      profiles: {},
      selectedProfile: '(Default)',
      clientToken: '00000000-0000-0000-0000-000000000000',
      authenticationDatabase: {}
    }))
  }

  onProgress(`Downloading NeoForge ${neoforgeVersion} installer…`)
  const installerPath = await installNeoforgeLoader(gameDir, neoforgeVersion)

  onProgress(`Running NeoForge ${neoforgeVersion} installer (this may take a minute)…`)

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      javaExecutable,
      ['-jar', installerPath, '--installClient', gameDir],
      { cwd: gameDir, windowsHide: true, timeout: 5 * 60 * 1000 }
    )

    const emit = (data: Buffer): void => {
      for (const line of data.toString('utf-8').split(/\r?\n/)) {
        const t = line.trim()
        if (t) onLog?.(`[NeoForge installer] ${t}`)
      }
    }
    proc.stdout?.on('data', emit)
    proc.stderr?.on('data', emit)

    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`NeoForge installer exited with code ${code}`))
    })
  })

  if (!existsSync(versionJson)) {
    throw new Error(`NeoForge installer finished but version profile not found at ${versionJson}`)
  }

  return versionId
}

/**
 * Read the NeoForge version profile JVM args and resolve template variables.
 * MCLC doesn't apply these from custom version profiles, so we pass them as
 * customArgs ourselves. This sets up the JPMS module path that NeoForge needs.
 */
export function readNeoforgeJvmArgs(gameDir: string, versionId: string): string[] {
  const versionJson = join(gameDir, 'versions', versionId, `${versionId}.json`)
  if (!existsSync(versionJson)) return []
  try {
    const profile = JSON.parse(readFileSync(versionJson, 'utf-8')) as { arguments?: { jvm?: unknown[] } }
    const raw = profile?.arguments?.jvm ?? []
    const sep = process.platform === 'win32' ? ';' : ':'
    const libDir = join(gameDir, 'libraries')
    return raw
      .filter((a): a is string => typeof a === 'string')
      .map((a) =>
        a
          .replace(/\$\{library_directory\}/g, libDir)
          .replace(/\$\{classpath_separator\}/g, sep)
          .replace(/\$\{version_name\}/g, versionId)
      )
  } catch {
    return []
  }
}

// ── servers.dat injection ─────────────────────────────────────────────────────
// Writes Minecraft's multiplayer server list (NBT format) so the permanent
// servers appear in-game the first time a player opens the Multiplayer screen.

const INJECTED_SERVERS: Array<{ name: string; ip: string }> = []

function nbtStr(s: string): Buffer {
  const b = Buffer.from(s, 'utf8')
  const len = Buffer.allocUnsafe(2)
  len.writeUInt16BE(b.length)
  return Buffer.concat([len, b])
}

function buildServersDat(servers: Array<{ name: string; ip: string }>): Buffer {
  const parts: Buffer[] = []

  parts.push(Buffer.from([10, 0, 0]))                // TAG_Compound, name ""
  parts.push(Buffer.from([9]), nbtStr('servers'))     // TAG_List "servers"
  parts.push(Buffer.from([10]))                       // element type TAG_Compound

  const count = Buffer.allocUnsafe(4)
  count.writeInt32BE(servers.length)
  parts.push(count)

  for (const s of servers) {
    parts.push(Buffer.from([8]), nbtStr('ip'),   nbtStr(s.ip))    // TAG_String "ip"
    parts.push(Buffer.from([8]), nbtStr('name'), nbtStr(s.name))  // TAG_String "name"
    parts.push(Buffer.from([1]), nbtStr('acceptTextures'), Buffer.from([1])) // TAG_Byte
    parts.push(Buffer.from([0]))                      // TAG_End (close element)
  }

  parts.push(Buffer.from([0]))                        // TAG_End (close root)
  return Buffer.concat(parts)
}

function ipInDat(dat: Buffer, ip: string): boolean {
  const ipBuf = Buffer.from(ip, 'utf8')
  const needle = Buffer.allocUnsafe(2 + ipBuf.length)
  needle.writeUInt16BE(ipBuf.length)
  ipBuf.copy(needle, 2)
  for (let i = 0; i <= dat.length - needle.length; i++) {
    if (dat.subarray(i, i + needle.length).equals(needle)) return true
  }
  return false
}

function injectServersDat(gameDir: string): void {
  const datPath = join(gameDir, 'servers.dat')
  if (existsSync(datPath)) {
    const existing = readFileSync(datPath)
    if (INJECTED_SERVERS.every((s) => ipInDat(existing, s.ip))) return
  }
  writeFileSync(datPath, buildServersDat(INJECTED_SERVERS))
}

// ── Download helper ───────────────────────────────────────────────────────────

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`)
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
}

/**
 * Batch file metadata can omit downloadUrl. Ask CurseForge's dedicated,
 * authenticated download-url endpoint before treating the file as restricted.
 */
export async function getCurseForgeDownloadUrl(
  modId: number,
  fileId: number,
  advertisedUrl?: string | null
): Promise<string | null> {
  assertCurseForgeEnabled()
  if (advertisedUrl) return advertisedUrl
  const res = await curseForgeFetch(`${CF_BASE}/mods/${modId}/files/${fileId}/download-url`)
  if (!res.ok) return null
  const data = (await res.json() as { data?: unknown }).data
  return typeof data === 'string' && data ? data : null
}

async function addCurseForgeFilePageUrls(
  files: MissingCurseForgeFile[]
): Promise<MissingCurseForgeFile[]> {
  if (!files.length) return files
  const siteUrlByProject = new Map<number, string>()
  const projectIds = [...new Set(files.map((file) => file.projectId))]

  try {
    const projects = await fetchCurseForgeProjects(projectIds)
    for (const project of projects.values()) {
      const websiteUrl = project.links?.websiteUrl
      if (typeof websiteUrl === 'string') {
        try {
          const parsed = new URL(websiteUrl)
          if (parsed.protocol === 'https:' && parsed.hostname.endsWith('curseforge.com')) {
            siteUrlByProject.set(Number(project.id), websiteUrl.replace(/\/+$/, ''))
          }
        } catch {
          // Ignore malformed project links and leave this row without a download action.
        }
      }
    }
    for (const file of files) {
      file.installDirectory ??= curseForgeInstallDirectory(
        Number(projects.get(file.projectId)?.classId)
      )
    }
  } catch {
    // The import itself remains usable if CurseForge's project metadata is unavailable.
  }

  return files.map((file) => {
    const projectUrl = siteUrlByProject.get(file.projectId)
    const enriched = { ...file, installDirectory: file.installDirectory ?? 'mods' as const }
    return projectUrl
      ? { ...enriched, filePageUrl: `${projectUrl}/files/${file.fileId}` }
      : enriched
  })
}

interface CurseForgePackIdentity {
  externalId: string
  packVersionId?: string
  iconUrl?: string
  screenshotUrls?: string[]
}

function normalizedPackName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function curseForgeManifestImage(zip: AdmZip, imagePath: unknown): string | undefined {
  if (typeof imagePath !== 'string') return undefined
  const normalized = imagePath.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) return undefined
  const entry = zip.getEntries().find(
    (candidate) =>
      !candidate.isDirectory
      && candidate.entryName.replace(/\\/g, '/').toLowerCase() === normalized.toLowerCase()
  )
  if (!entry) return undefined
  const extension = normalized.split('.').pop()?.toLowerCase()
  const mime = extension === 'png' ? 'image/png'
    : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
    : extension === 'webp' ? 'image/webp'
    : extension === 'gif' ? 'image/gif'
    : null
  if (!mime) return undefined
  const data = entry.getData()
  if (!data.length || data.length > 5 * 1024 * 1024) return undefined
  return `data:${mime};base64,${data.toString('base64')}`
}

export async function findCurseForgePackIdentity(
  packName: string,
  packVersion?: string,
  sourceFileName?: string
): Promise<CurseForgePackIdentity | null> {
  assertCurseForgeEnabled()
  const fullName = packName.trim()
  if (!fullName) return null
  const broadName = fullName.split(/[:\-–—]/, 1)[0].trim()
  const queries = [...new Set([fullName, broadName].filter(Boolean))]
  const projectsById = new Map<number, any>()
  try {
    for (const query of queries) {
      const params = new URLSearchParams({
        gameId: '432',
        classId: '4471',
        searchFilter: query,
        pageSize: '20'
      })
      const res = await curseForgeFetch(`${CF_BASE}/mods/search?${params}`)
      if (!res.ok) continue
      const projects = ((await res.json() as any).data as any[]) ?? []
      for (const project of projects) projectsById.set(Number(project.id), project)
    }

    const wantedName = normalizedPackName(fullName)
    const candidates = [...projectsById.values()].filter((project) => {
      const projectName = normalizedPackName(String(project.name ?? ''))
      return projectName.length >= 6
        && (wantedName === projectName
          || wantedName.startsWith(projectName)
          || projectName.startsWith(wantedName))
    })
    if (candidates.length !== 1) return null

    const project = candidates[0]
    let matchedFileId: string | undefined
    if (packVersion || sourceFileName) {
      const filesRes = await curseForgeFetch(`${CF_BASE}/mods/${project.id}/files?pageSize=50`)
      if (!filesRes.ok) return null
      const files = ((await filesRes.json() as any).data as any[]) ?? []
      const expectedFileName = sourceFileName?.toLowerCase()
      const expectedDisplayName = packVersion
        ? normalizedPackName(`${fullName} ${packVersion}`)
        : ''
      const matched = files.find((file) =>
        expectedFileName && String(file.fileName ?? '').toLowerCase() === expectedFileName
      ) ?? files.find((file) =>
        expectedDisplayName && normalizedPackName(String(file.displayName ?? '')) === expectedDisplayName
      )
      if (!matched) return null
      matchedFileId = String(matched.id)
    }

    return {
      externalId: String(project.id),
      packVersionId: matchedFileId,
      iconUrl: project.logo?.thumbnailUrl || project.logo?.url || undefined,
      screenshotUrls: (project.screenshots ?? [])
        .map((screenshot: any) => screenshot.url || screenshot.thumbnailUrl)
        .filter(Boolean)
        .slice(0, 12)
    }
  } catch {
    return null
  }
}

// ── Modrinth mrpack ───────────────────────────────────────────────────────────

export async function installMrpack(
  instanceId: string,
  projectId: string,
  packVersionId: string | undefined,
  onProgress: (msg: string, pct?: number) => void
): Promise<PackMarker> {
  const gameDir = instanceGameDir(instanceId)

  onProgress('Fetching modpack info…')
  let versionData: any
  if (packVersionId) {
    const res = await fetch(`${MR_BASE}/version/${packVersionId}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`Modrinth ${res.status}`)
    versionData = await res.json()
  } else {
    const res = await fetch(`${MR_BASE}/project/${projectId}/version`, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`Modrinth ${res.status}`)
    const versions = await res.json() as any[]
    if (!versions.length) throw new Error('No versions available for this modpack')
    versionData = versions[0]
  }

  const fileInfo = (versionData.files as any[])?.find(
    (f: any) => f.primary || f.filename?.endsWith('.mrpack')
  ) ?? versionData.files?.[0]
  if (!fileInfo?.url) throw new Error('mrpack download URL not found')

  onProgress('Downloading modpack archive…')
  const packRes = await fetch(fileInfo.url, { headers: { 'User-Agent': UA } })
  if (!packRes.ok) throw new Error(`Failed to download mrpack: ${packRes.status}`)
  const packBuf = Buffer.from(await packRes.arrayBuffer())

  const zip = openValidatedZip(packBuf)

  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) throw new Error('modrinth.index.json missing from mrpack')
  const index = JSON.parse(indexEntry.getData().toString('utf8'))

  // Extract loader info from the mrpack dependencies
  const deps: Record<string, string> = index.dependencies ?? {}
  const loaderKey = Object.keys(deps).find((k) =>
    ['fabric-loader', 'quilt-loader', 'forge', 'neoforge'].includes(k)
  )
  const rawLoaderType = loaderKey ?? 'vanilla'
  // Normalise: 'fabric-loader' → 'fabric', 'quilt-loader' → 'quilt'
  const loaderType = rawLoaderType.replace('-loader', '')
  const loaderVersion = loaderKey ? deps[loaderKey] : undefined

  // Download client-side mod files; wipe mods dir first so stale JARs from a
  // previous version don't coexist with the new version's mods.
  const allFiles: Array<{
    path: string
    downloads: string[]
    hashes?: Record<string, string>
    env?: { client?: string; server?: string }
  }> = index.files ?? []
  const clientFiles = allFiles.filter((f) => f.env?.client !== 'unsupported')

  const mrModsDir = join(gameDir, 'mods')
  if (existsSync(mrModsDir)) {
    for (const f of readdirSync(mrModsDir)) {
      try { rmSync(join(mrModsDir, f), { force: true }) } catch { /* skip locked files */ }
    }
  }

  for (let i = 0; i < clientFiles.length; i++) {
    const f = clientFiles[i]
    const destPath = safeJoin(gameDir, f.path)
    if (!destPath) throw new Error(`Pack contains an unsafe path: ${f.path}`)
    const destDir = dirname(destPath)

    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

    if (!existsSync(destPath)) {
      for (const url of f.downloads) {
        try {
          await downloadToFile(url, destPath)
          break
        } catch { /* try next mirror */ }
      }
      if (!existsSync(destPath)) throw new Error(`Failed to download required file: ${f.path}`)
    }
    verifyPackFile(destPath, f.hashes)

    const pct = Math.round(((i + 1) / clientFiles.length) * 85)
    onProgress(`Downloading files… (${i + 1}/${clientFiles.length})`, pct)
  }

  // Extract overrides
  onProgress('Extracting config overrides…', 90)
  for (const prefix of ['overrides/', 'client-overrides/']) {
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue
      const rel = entry.entryName.slice(prefix.length)
      const dest = safeJoin(gameDir, rel)
      if (!dest) continue
      const destDir = dirname(dest)
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      writeFileSync(dest, entry.getData())
    }
  }

  injectServersDat(gameDir)

  const marker: PackMarker = {
    packVersionId: versionData.id ?? packVersionId,
    loaderType,
    loaderVersion
  }
  writeMarker(instanceId, marker)
  return marker
}

// ── Local pack import ─────────────────────────────────────────────────────────

export interface ImportResult {
  marker: PackMarker
  name: string
  mcVersion: string
  recommendedRamMb?: number
  jvmArgs?: string
  iconUrl?: string
  source?: 'curseforge'
  externalId?: string
  packVersionId?: string
  screenshotUrls?: string[]
  missingFiles?: MissingCurseForgeFile[]
}

async function loadPrismComponent(
  zip: AdmZip,
  root: string,
  ref: PrismComponentRef
): Promise<PrismComponent> {
  const local = zip.getEntry(`${root}patches/${ref.uid}.json`)
  if (local) return JSON.parse(local.getData().toString('utf8')) as PrismComponent

  const version = ref.version ?? ref.cachedVersion
  if (!version) throw new Error(`Prism component ${ref.uid} has no version.`)
  const url = `https://meta.prismlauncher.org/v1/${encodeURIComponent(ref.uid)}/${encodeURIComponent(version)}.json`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Could not resolve Prism component ${ref.uid} ${version} (${res.status}).`)
  return await res.json() as PrismComponent
}

async function importPrismPack(
  zip: AdmZip,
  root: string,
  instanceId: string,
  onProgress: (msg: string, pct?: number) => void
): Promise<ImportResult> {
  const gameDir = instanceGameDir(instanceId)
  const packEntry = zip.getEntry(`${root}mmc-pack.json`)
  if (!packEntry) throw new Error('mmc-pack.json missing from Prism pack.')

  const pack = JSON.parse(packEntry.getData().toString('utf8')) as { components?: PrismComponentRef[] }
  const refs = pack.components ?? []
  const mcRef = refs.find((ref) => ref.uid === 'net.minecraft')
  const mcVersion = mcRef?.version ?? mcRef?.cachedVersion ?? ''
  if (!mcVersion) throw new Error('Prism pack does not specify a Minecraft version.')

  onProgress('Resolving Prism components…', 10)
  const components: PrismComponent[] = []
  for (let i = 0; i < refs.length; i++) {
    components.push(await loadPrismComponent(zip, root, refs[i]))
    onProgress(
      `Resolving Prism components… (${i + 1}/${refs.length})`,
      10 + Math.round(((i + 1) / refs.length) * 20)
    )
  }

  const profile = mergePrismComponents(components, mcVersion)
  const cfgEntry = zip.getEntry(`${root}instance.cfg`)
  const cfg = cfgEntry ? parseInstanceCfg(cfgEntry.getData().toString('utf8')) : {}
  const iconUrl = findPrismIconDataUrl(zip, root, cfg)
  const configuredJavaMajor = parseInt(cfg.JavaVersion?.split('.')[0] ?? '', 10)
  if (Number.isFinite(configuredJavaMajor)) profile.javaMajor = configuredJavaMajor

  const extractPrefixes = [
    { source: `${root}.minecraft/`, destination: gameDir },
    { source: `${root}minecraft/`, destination: gameDir },
    { source: `${root}libraries/`, destination: join(gameDir, 'libraries') },
    { source: `${root}natives/`, destination: join(gameDir, 'natives') }
  ]
  const files = zip.getEntries().filter((entry) => {
    const name = entry.entryName.replace(/\\/g, '/')
    return !entry.isDirectory && extractPrefixes.some(({ source }) => name.startsWith(source))
  })

  onProgress('Extracting Prism instance…', 35)
  for (let i = 0; i < files.length; i++) {
    const entry = files[i]
    const normalized = entry.entryName.replace(/\\/g, '/')
    const mapping = extractPrefixes.find(({ source }) => normalized.startsWith(source))!
    const relative = normalized.slice(mapping.source.length)
    if (!relative) continue
    const destination = safeJoin(mapping.destination, relative)
    if (!destination) throw new Error(`Prism pack contains an unsafe path: ${entry.entryName}`)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, entry.getData())
    if (i % 50 === 0 || i === files.length - 1) {
      onProgress(
        `Extracting Prism instance… (${i + 1}/${files.length})`,
        35 + Math.round(((i + 1) / Math.max(files.length, 1)) * 55)
      )
    }
  }

  const versionDir = join(gameDir, 'versions', profile.versionId)
  mkdirSync(versionDir, { recursive: true })
  writeFileSync(join(versionDir, `${profile.versionId}.json`), JSON.stringify(profile.versionJson, null, 2))
  writeFileSync(join(gameDir, PRISM_PROFILE_FILE), JSON.stringify(profile, null, 2))

  const forgeRef = refs.find((ref) => ref.uid === 'net.minecraftforge')
  const loaderType = forgeRef ? 'forge'
    : refs.some((ref) => ref.uid.includes('neoforge')) ? 'neoforge'
    : refs.some((ref) => ref.uid.includes('fabric')) ? 'fabric'
    : refs.some((ref) => ref.uid.includes('quilt')) ? 'quilt'
    : 'vanilla'
  const loaderRef = forgeRef ?? refs.find((ref) =>
    ref.uid.includes('neoforge') || ref.uid.includes('fabric') || ref.uid.includes('quilt')
  )
  const marker: PackMarker = {
    loaderType,
    loaderVersion: loaderRef?.version ?? loaderRef?.cachedVersion
  }
  writeMarker(instanceId, marker)
  injectServersDat(gameDir)

  const recommendedRamMb = parseInt(cfg.MaxMemAlloc ?? '', 10)
  return {
    marker,
    name: cfg.name || 'Imported Prism Instance',
    mcVersion,
    recommendedRamMb: Number.isFinite(recommendedRamMb) ? recommendedRamMb : undefined,
    jvmArgs: cfg.JvmArgs || undefined,
    iconUrl
  }
}

export async function importLocalPack(
  instanceId: string,
  filePath: string,
  onProgress: (msg: string, pct?: number) => void
): Promise<ImportResult> {
  const gameDir = instanceGameDir(instanceId)

  onProgress('Reading pack file…')
  // Pass the path directly so very large Prism exports do not retain both a
  // separate readFile buffer and AdmZip's archive buffer in memory.
  const zip = openValidatedZip(filePath)

  const mrpackEntry = zip.getEntry('modrinth.index.json')
  const cfEntry = zip.getEntry('manifest.json')
  const prismRoot = findPrismRoot(zip.getEntries())

  if (prismRoot !== null) {
    return importPrismPack(zip, prismRoot, instanceId, onProgress)
  }

  if (mrpackEntry) {
    // ── mrpack format ────────────────────────────────────────────────────────
    const index = JSON.parse(mrpackEntry.getData().toString('utf8'))
    const deps: Record<string, string> = index.dependencies ?? {}

    const loaderKey = Object.keys(deps).find((k) =>
      ['fabric-loader', 'quilt-loader', 'forge', 'neoforge'].includes(k)
    )
    const loaderType = (loaderKey ?? 'vanilla').replace('-loader', '')
    const loaderVersion = loaderKey ? deps[loaderKey] : undefined
    const mcVersion = deps['minecraft'] ?? ''
    const name: string = index.name ?? 'Imported Pack'

    const allFiles: Array<{
      path: string
      downloads: string[]
      hashes?: Record<string, string>
      env?: { client?: string; server?: string }
    }> = index.files ?? []
    const clientFiles = allFiles.filter((f) => f.env?.client !== 'unsupported')

    for (let i = 0; i < clientFiles.length; i++) {
      const f = clientFiles[i]
      const destPath = safeJoin(gameDir, f.path)
      if (!destPath) throw new Error(`Pack contains an unsafe path: ${f.path}`)
      const destDir = dirname(destPath)
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      if (!existsSync(destPath)) {
        for (const url of f.downloads) {
          try { await downloadToFile(url, destPath); break } catch { /* try next mirror */ }
        }
        if (!existsSync(destPath)) throw new Error(`Failed to download required file: ${f.path}`)
      }
      verifyPackFile(destPath, f.hashes)
      onProgress(
        `Downloading files… (${i + 1}/${clientFiles.length})`,
        Math.round(((i + 1) / clientFiles.length) * 85)
      )
    }

    const overrideEntries = ['overrides/', 'client-overrides/'].flatMap((prefix) =>
      zip.getEntries()
        .filter((entry) => entry.entryName.startsWith(prefix) && !entry.isDirectory)
        .map((entry) => ({ entry, prefix }))
    )
    onProgress(`Extracting overrides… (0/${overrideEntries.length})`, 90)
    for (let i = 0; i < overrideEntries.length; i++) {
      const { entry, prefix } = overrideEntries[i]
      const rel = entry.entryName.slice(prefix.length)
      const dest = safeJoin(gameDir, rel)
      if (!dest) continue
      const destDir = dirname(dest)
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      writeFileSync(dest, entry.getData())
      onProgress(
        `Extracting overrides… (${i + 1}/${overrideEntries.length})`,
        90 + Math.round(((i + 1) / Math.max(1, overrideEntries.length)) * 9)
      )
      if ((i + 1) % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve))
    }

    injectServersDat(gameDir)
    const marker: PackMarker = { loaderType, loaderVersion }
    writeMarker(instanceId, marker)
    return { marker, name, mcVersion }
  }

  if (cfEntry) {
    assertCurseForgeEnabled()
    // ── CurseForge format ────────────────────────────────────────────────────
    const manifest = JSON.parse(cfEntry.getData().toString('utf8'))
    const loaderEntry: string | undefined = manifest.minecraft?.modLoaders?.[0]?.id
    let loaderType = 'vanilla'
    let loaderVersion: string | undefined
    if (loaderEntry) {
      const dash = loaderEntry.indexOf('-')
      if (dash !== -1) {
        loaderType = loaderEntry.slice(0, dash)
        loaderVersion = loaderEntry.slice(dash + 1)
      }
    }
    const mcVersion: string = manifest.minecraft?.version ?? ''
    const name: string = manifest.name ?? 'Imported Pack'
    const packVersion = typeof manifest.version === 'string' ? manifest.version : undefined
    const embeddedIconUrl = curseForgeManifestImage(zip, manifest.image)
    onProgress('Matching CurseForge project…', 2)
    const curseForgeIdentity = await findCurseForgePackIdentity(
      name,
      packVersion,
      basename(filePath)
    )

    const modEntries: Array<{ projectID: number; fileID: number; required: boolean }> =
      (manifest.files ?? []).filter((m: any) => m.required)
    const curseForgeProjects = await fetchCurseForgeProjects(
      modEntries.map((entry) => entry.projectID)
    )
    const overridePrefix = `${manifest.overrides ?? 'overrides'}/`
    const bundledEntryNames = new Set(
      zip.getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.entryName.toLowerCase())
    )

    onProgress(`Fetching download URLs for ${modEntries.length} mods…`)
    const BATCH = 100
    let done = 0
    const unavailable: MissingCurseForgeFile[] = []

    for (let i = 0; i < modEntries.length; i += BATCH) {
      const batch = modEntries.slice(i, i + BATCH)
      const res = await curseForgeFetch(`${CF_BASE}/mods/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: batch.map((m) => m.fileID) })
      })
      if (!res.ok) throw new Error(`CurseForge ${res.status}`)
      const files = ((await res.json() as any).data as any[]) ?? []
      const returnedIds = new Set(files.map((file) => Number(file.id)))
      for (const file of files) {
        done++
        const manifestEntry = modEntries.find((entry) => entry.fileID === file.id)
        const projectId = Number(file.modId ?? manifestEntry?.projectID)
        const installDirectory = curseForgeInstallDirectory(
          Number(curseForgeProjects.get(projectId)?.classId)
        )
        const dest = curseForgeDestination(gameDir, String(file.fileName), installDirectory)
        const bundledPath = `${overridePrefix}${installDirectory}/${String(file.fileName)}`.toLowerCase()
        const isBundled = bundledEntryNames.has(bundledPath)
        const downloadUrl = isBundled
          ? null
          : await getCurseForgeDownloadUrl(
              projectId,
              Number(file.id),
              file.downloadUrl
            )
        if (!isBundled && !downloadUrl) {
          unavailable.push({
            projectId,
            fileId: Number(file.id),
            displayName: file.displayName ?? file.fileName ?? `CurseForge file ${file.id}`,
            fileName: file.fileName ? String(file.fileName) : undefined,
            hashes: curseForgeHashes(file),
            installDirectory
          })
        } else if (!isBundled && !existsSync(dest)) {
          await downloadToFile(downloadUrl!, dest)
        }
        onProgress(
          `Downloading mods… (${done}/${modEntries.length})`,
          Math.round((done / modEntries.length) * 85)
        )
      }
      for (const missingMetadata of batch.filter((entry) => !returnedIds.has(entry.fileID))) {
        done++
        unavailable.push({
          projectId: missingMetadata.projectID,
          fileId: missingMetadata.fileID,
          displayName: `CurseForge project ${missingMetadata.projectID}, file ${missingMetadata.fileID}`,
          installDirectory: curseForgeInstallDirectory(
            Number(curseForgeProjects.get(missingMetadata.projectID)?.classId)
          )
        })
      }
    }

    const overrideEntries = zip.getEntries().filter(
      (entry) => entry.entryName.startsWith(overridePrefix) && !entry.isDirectory
    )
    onProgress(`Extracting overrides… (0/${overrideEntries.length})`, 90)
    for (let i = 0; i < overrideEntries.length; i++) {
      const entry = overrideEntries[i]
      const rel = entry.entryName.slice(overridePrefix.length)
      const dest = safeJoin(gameDir, rel)
      if (!dest) continue
      const destDir = dirname(dest)
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      writeFileSync(dest, entry.getData())
      onProgress(
        `Extracting overrides… (${i + 1}/${overrideEntries.length})`,
        90 + Math.round(((i + 1) / Math.max(1, overrideEntries.length)) * 9)
      )
      if ((i + 1) % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve))
    }

    const missingFiles = await addCurseForgeFilePageUrls(unavailable)
    injectServersDat(gameDir)
    const marker: PackMarker = {
      packVersionId: curseForgeIdentity?.packVersionId,
      loaderType,
      loaderVersion,
      missingCurseForgeFiles: missingFiles,
      curseForgeImport: {
        name,
        version: packVersion,
        sourceFileName: basename(filePath)
      }
    }
    writeMarker(instanceId, marker)
    return {
      marker,
      name,
      mcVersion,
      missingFiles,
      iconUrl: curseForgeIdentity?.iconUrl ?? embeddedIconUrl,
      source: curseForgeIdentity ? 'curseforge' : undefined,
      externalId: curseForgeIdentity?.externalId,
      packVersionId: curseForgeIdentity?.packVersionId,
      screenshotUrls: curseForgeIdentity?.screenshotUrls
    }
  }

  throw new Error(
    'Unknown format. The file must be a Modrinth, CurseForge, or Prism/MultiMC modpack zip.'
  )
}

// ── CurseForge zip ────────────────────────────────────────────────────────────

export async function installCfPack(
  instanceId: string,
  modId: string,
  fileId: string | undefined,
  onProgress: (msg: string, pct?: number) => void
): Promise<PackMarker> {
  assertCurseForgeEnabled()
  const gameDir = instanceGameDir(instanceId)

  onProgress('Fetching modpack info…')
  let fileData: any
  if (fileId) {
    const res = await curseForgeFetch(`${CF_BASE}/mods/${modId}/files/${fileId}`)
    if (!res.ok) throw new Error(`CurseForge ${res.status}`)
    fileData = (await res.json() as any).data
  } else {
    const res = await curseForgeFetch(`${CF_BASE}/mods/${modId}/files?pageSize=1&sortField=1&sortOrder=desc`)
    if (!res.ok) throw new Error(`CurseForge ${res.status}`)
    fileData = (await res.json() as any).data?.[0]
  }

  const packDownloadUrl = fileData
    ? await getCurseForgeDownloadUrl(Number(modId), Number(fileData.id), fileData.downloadUrl)
    : null
  if (!packDownloadUrl) {
    throw new Error(
      'This CurseForge pack blocks direct third-party downloads. Export it as a ZIP from the ' +
      'CurseForge app, then import that ZIP.'
    )
  }

  onProgress('Downloading modpack archive…')
  const packRes = await fetch(packDownloadUrl, { headers: { 'User-Agent': UA } })
  if (!packRes.ok) throw new Error(`Failed to download pack: ${packRes.status}`)
  const packBuf = Buffer.from(await packRes.arrayBuffer())

  const zip = openValidatedZip(packBuf)
  const manifestEntry = zip.getEntry('manifest.json')
  if (!manifestEntry) throw new Error('manifest.json missing from CurseForge pack')
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'))

  // Parse loader type/version from manifest
  const loaderEntry: string | undefined = manifest.minecraft?.modLoaders?.[0]?.id
  let loaderType = 'vanilla'
  let loaderVersion: string | undefined
  if (loaderEntry) {
    const dash = loaderEntry.indexOf('-')
    if (dash !== -1) {
      loaderType = loaderEntry.slice(0, dash)
      loaderVersion = loaderEntry.slice(dash + 1)
    }
  }

  // Download mods; wipe the directory first so stale mods from a previous
  // version don't end up alongside the new version's mods (duplicate JARs crash NeoForge).
  const modEntries: Array<{ projectID: number; fileID: number; required: boolean }> =
    (manifest.files ?? []).filter((m: any) => m.required)
  const curseForgeProjects = await fetchCurseForgeProjects(
    modEntries.map((entry) => entry.projectID)
  )
  const overridePrefix = `${manifest.overrides ?? 'overrides'}/`
  const bundledEntryNames = new Set(
    zip.getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName.toLowerCase())
  )
  const modsDir = join(gameDir, 'mods')
  if (existsSync(modsDir)) {
    for (const f of readdirSync(modsDir)) {
      try { rmSync(join(modsDir, f), { force: true }) } catch { /* skip locked files */ }
    }
  }
  mkdirSync(modsDir, { recursive: true })

  onProgress(`Fetching download URLs for ${modEntries.length} mods…`)
  const BATCH = 100
  let done = 0
  const unavailable: MissingCurseForgeFile[] = []

  for (let i = 0; i < modEntries.length; i += BATCH) {
    const batch = modEntries.slice(i, i + BATCH)
    const res = await curseForgeFetch(`${CF_BASE}/mods/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: batch.map((m) => m.fileID) })
    })
    if (!res.ok) throw new Error(`CurseForge ${res.status}`)
    const files = (await res.json() as any).data as any[] ?? []
    const returnedIds = new Set(files.map((file) => Number(file.id)))

    for (const file of files) {
      done++
      const manifestEntry = batch.find((entry) => entry.fileID === Number(file.id))
      const projectId = Number(file.modId ?? manifestEntry?.projectID)
      const installDirectory = curseForgeInstallDirectory(
        Number(curseForgeProjects.get(projectId)?.classId)
      )
      const dest = curseForgeDestination(gameDir, String(file.fileName), installDirectory)
      const bundledPath = `${overridePrefix}${installDirectory}/${String(file.fileName)}`.toLowerCase()
      const isBundled = bundledEntryNames.has(bundledPath)
      const downloadUrl = isBundled
        ? null
        : await getCurseForgeDownloadUrl(projectId, Number(file.id), file.downloadUrl)
      if (!isBundled && !downloadUrl) {
        unavailable.push({
          projectId,
          fileId: Number(file.id),
          displayName: file.displayName ?? file.fileName ?? `CurseForge file ${file.id}`,
          fileName: file.fileName ? String(file.fileName) : undefined,
          hashes: curseForgeHashes(file),
          installDirectory
        })
      } else if (!isBundled && !existsSync(dest)) {
        await downloadToFile(downloadUrl!, dest)
      }
      const pct = Math.round((done / modEntries.length) * 85)
      onProgress(`Downloading mods… (${done}/${modEntries.length})`, pct)
    }
    for (const missingMetadata of batch.filter((entry) => !returnedIds.has(entry.fileID))) {
      done++
      unavailable.push({
        projectId: missingMetadata.projectID,
        fileId: missingMetadata.fileID,
        displayName: `CurseForge project ${missingMetadata.projectID}, file ${missingMetadata.fileID}`,
        installDirectory: curseForgeInstallDirectory(
          Number(curseForgeProjects.get(missingMetadata.projectID)?.classId)
        )
      })
      const pct = Math.round((done / modEntries.length) * 85)
      onProgress(`Downloading mods… (${done}/${modEntries.length})`, pct)
    }
  }

  // Extract overrides
  onProgress('Extracting config overrides…', 90)
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith(overridePrefix) || entry.isDirectory) continue
    const rel = entry.entryName.slice(overridePrefix.length)
    const dest = safeJoin(gameDir, rel)
    if (!dest) continue
    const destDir = dirname(dest)
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    writeFileSync(dest, entry.getData())
  }

  injectServersDat(gameDir)

  const missingFiles = await addCurseForgeFilePageUrls(unavailable)

  const marker: PackMarker = {
    packVersionId: String(fileData.id),
    loaderType,
    loaderVersion,
    missingCurseForgeFiles: missingFiles
  }
  writeMarker(instanceId, marker)
  return marker
}
