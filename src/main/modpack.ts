/**
 * Modpack installation — downloads mod files and determines the correct loader version.
 * Called from launcher.ts during the 'preparing' phase on first launch (or after a version switch).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import AdmZip from 'adm-zip'
import { instanceGameDir } from './instances'
import { getSettings } from './settings'

const MR_BASE = 'https://api.modrinth.com/v2'
const CF_BASE = 'https://api.curseforge.com/v1'
const UA = 'ender-launcher/0.1.5 (ender-launcher)'

// ── Marker file ───────────────────────────────────────────────────────────────
// Written after a successful install so we don't re-download on every launch.

interface PackMarker {
  packVersionId?: string
  loaderType: string       // 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'vanilla'
  loaderVersion?: string   // e.g. '0.16.5' for Fabric, '47.2.0' for Forge
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
 * Returns the JAR path for MCLC's `forge:` option — ForgeWrapper handles the rest.
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
 * Returns the JAR path for MCLC's `forge:` option — ForgeWrapper handles the rest.
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

  const zip = new AdmZip(packBuf)

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

  // Download client-side mod files — wipe mods dir first so stale JARs from a
  // previous version don't coexist with the new version's mods.
  const allFiles: Array<{
    path: string
    downloads: string[]
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
    const destPath = join(gameDir, ...f.path.split('/'))
    const destDir = join(destPath, '..')

    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

    if (!existsSync(destPath)) {
      for (const url of f.downloads) {
        try {
          await downloadToFile(url, destPath)
          break
        } catch { /* try next mirror */ }
      }
    }

    const pct = Math.round(((i + 1) / clientFiles.length) * 85)
    onProgress(`Downloading files… (${i + 1}/${clientFiles.length})`, pct)
  }

  // Extract overrides
  onProgress('Extracting config overrides…', 90)
  for (const prefix of ['overrides/', 'client-overrides/']) {
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue
      const rel = entry.entryName.slice(prefix.length)
      const dest = join(gameDir, ...rel.split('/'))
      const destDir = join(dest, '..')
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

// ── FTB pack ─────────────────────────────────────────────────────────────────

const FTB_API = 'https://api.modpacks.ch'

export async function installFtbPack(
  instanceId: string,
  packId: string,
  versionId: string | undefined,
  onProgress: (msg: string, pct?: number) => void
): Promise<PackMarker> {
  const gameDir = instanceGameDir(instanceId)

  onProgress('Fetching modpack info…')

  let resolvedVersionId: number | undefined = versionId ? parseInt(versionId, 10) : undefined
  if (!resolvedVersionId) {
    const packRes = await fetch(`${FTB_API}/public/modpack/${packId}`, { headers: { 'User-Agent': UA } })
    if (!packRes.ok) throw new Error(`FTB ${packRes.status}`)
    const pack = await packRes.json() as any
    const versions: any[] = pack.versions ?? []
    if (!versions.length) throw new Error('No versions available for this FTB modpack')
    resolvedVersionId = versions[versions.length - 1].id
  }

  onProgress('Fetching version details…')
  const verRes = await fetch(`${FTB_API}/public/modpack/${packId}/${resolvedVersionId}`, { headers: { 'User-Agent': UA } })
  if (!verRes.ok) throw new Error(`FTB ${verRes.status}`)
  const version = await verRes.json() as any

  const targets: any[] = version.targets ?? []
  const loaderTarget = targets.find((t: any) => t.type === 'modloader')
  const loaderType = loaderTarget?.name?.toLowerCase() ?? 'vanilla'
  const loaderVersion: string | undefined = loaderTarget?.version

  const files: any[] = (version.files ?? []).filter((f: any) => !f.serveronly)

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    if (!f.url) continue

    const pathParts = String(f.path ?? '').split('/').filter(Boolean)
    const filePath = join(gameDir, ...pathParts, f.name)
    const fileDir = join(filePath, '..')

    if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true })
    if (!existsSync(filePath)) {
      try {
        await downloadToFile(f.url, filePath)
      } catch { /* skip files that fail */ }
    }

    const pct = Math.round(((i + 1) / files.length) * 90)
    onProgress(`Downloading files… (${i + 1}/${files.length})`, pct)
  }

  injectServersDat(gameDir)

  const marker: PackMarker = {
    packVersionId: String(version.id ?? resolvedVersionId),
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
}

export async function importLocalPack(
  instanceId: string,
  filePath: string,
  onProgress: (msg: string, pct?: number) => void
): Promise<ImportResult> {
  const gameDir = instanceGameDir(instanceId)

  onProgress('Reading pack file…')
  const buf = readFileSync(filePath)
  const zip = new AdmZip(buf)

  const mrpackEntry = zip.getEntry('modrinth.index.json')
  const cfEntry = zip.getEntry('manifest.json')

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
      env?: { client?: string; server?: string }
    }> = index.files ?? []
    const clientFiles = allFiles.filter((f) => f.env?.client !== 'unsupported')

    for (let i = 0; i < clientFiles.length; i++) {
      const f = clientFiles[i]
      const destPath = join(gameDir, ...f.path.split('/'))
      const destDir = join(destPath, '..')
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      if (!existsSync(destPath)) {
        for (const url of f.downloads) {
          try { await downloadToFile(url, destPath); break } catch { /* try next mirror */ }
        }
      }
      onProgress(
        `Downloading files… (${i + 1}/${clientFiles.length})`,
        Math.round(((i + 1) / clientFiles.length) * 85)
      )
    }

    onProgress('Extracting config overrides…', 90)
    for (const prefix of ['overrides/', 'client-overrides/']) {
      for (const entry of zip.getEntries()) {
        if (!entry.entryName.startsWith(prefix) || entry.isDirectory) continue
        const rel = entry.entryName.slice(prefix.length)
        const dest = join(gameDir, ...rel.split('/'))
        const destDir = join(dest, '..')
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
        writeFileSync(dest, entry.getData())
      }
    }

    injectServersDat(gameDir)
    const marker: PackMarker = { loaderType, loaderVersion }
    writeMarker(instanceId, marker)
    return { marker, name, mcVersion }
  }

  if (cfEntry) {
    // ── CurseForge format ────────────────────────────────────────────────────
    const cfKey = getSettings().curseforgeApiKey
    if (!cfKey) {
      throw new Error(
        'A CurseForge API key is required to import this pack — add it in Settings → API Keys'
      )
    }

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

    const cfH = { 'x-api-key': cfKey, Accept: 'application/json' }
    const modEntries: Array<{ projectID: number; fileID: number; required: boolean }> =
      (manifest.files ?? []).filter((m: any) => m.required)
    const modsDir = join(gameDir, 'mods')
    if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })

    onProgress(`Fetching download URLs for ${modEntries.length} mods…`)
    const BATCH = 100
    let done = 0

    for (let i = 0; i < modEntries.length; i += BATCH) {
      const batch = modEntries.slice(i, i + BATCH)
      const res = await fetch(`${CF_BASE}/mods/files`, {
        method: 'POST',
        headers: { ...cfH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: batch.map((m) => m.fileID) })
      })
      const files = ((await res.json() as any).data as any[]) ?? []
      for (const file of files) {
        done++
        if (!file.downloadUrl) continue
        const dest = join(modsDir, file.fileName)
        if (existsSync(dest)) continue
        try { await downloadToFile(file.downloadUrl, dest) } catch { /* skip */ }
        onProgress(
          `Downloading mods… (${done}/${modEntries.length})`,
          Math.round((done / modEntries.length) * 85)
        )
      }
    }

    onProgress('Extracting config overrides…', 90)
    const overridePrefix = `${manifest.overrides ?? 'overrides'}/`
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith(overridePrefix) || entry.isDirectory) continue
      const rel = entry.entryName.slice(overridePrefix.length)
      const dest = join(gameDir, ...rel.split('/'))
      const destDir = join(dest, '..')
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      writeFileSync(dest, entry.getData())
    }

    injectServersDat(gameDir)
    const marker: PackMarker = { loaderType, loaderVersion }
    writeMarker(instanceId, marker)
    return { marker, name, mcVersion }
  }

  throw new Error(
    'Unknown format — file must be a .mrpack or a CurseForge modpack zip containing manifest.json'
  )
}

// ── ATLauncher pack ───────────────────────────────────────────────────────────

const ATL_CDN = 'https://download.nodecdn.net/containers/atl'
const ATL_INST_UA = 'Mozilla/5.0 ATLauncher/3.4.26.0'

export async function installAtlPack(
  instanceId: string,
  packId: string,
  packVersionId: string | undefined,
  onProgress: (msg: string, pct?: number) => void
): Promise<PackMarker> {
  const gameDir = instanceGameDir(instanceId)

  onProgress('Fetching pack list…')
  const listRes = await fetch(`${ATL_CDN}/launcher/json/packsnew.json`, {
    headers: { 'User-Agent': ATL_INST_UA }
  })
  if (!listRes.ok) throw new Error(`ATLauncher pack list fetch failed: ${listRes.status}`)
  const packs: any[] = await listRes.json()
  const pack = packs.find((p: any) => String(p.id) === packId)
  if (!pack) throw new Error(`ATLauncher pack ${packId} not found in pack list`)

  const safeName = pack.name.replace(/[^A-Za-z0-9]/g, '')
  const allVersions: any[] = pack.versions ?? []
  const targetVersion = packVersionId ?? allVersions[allVersions.length - 1]?.version
  if (!targetVersion) throw new Error('No versions available for this ATLauncher pack')

  onProgress('Fetching version details…')
  const versionUrl = `${ATL_CDN}/packs/${safeName}/versions/${targetVersion}/${safeName}.json`
  const versionRes = await fetch(versionUrl, { headers: { 'User-Agent': ATL_INST_UA } })
  if (!versionRes.ok) throw new Error(`ATLauncher version JSON fetch failed: ${versionRes.status}`)
  const versionData = await versionRes.json() as any

  const mcVersion: string = versionData.minecraft ?? ''
  const loaderRaw: string = (versionData.loader?.type ?? 'vanilla').toLowerCase()
  const loaderType = loaderRaw === 'forge' ? 'forge'
    : loaderRaw === 'fabric' ? 'fabric'
    : loaderRaw === 'neoforge' ? 'neoforge'
    : loaderRaw === 'quilt' ? 'quilt'
    : 'vanilla'
  const loaderVersion: string | undefined = versionData.loader?.version

  const mods: any[] = (versionData.mods ?? []).filter(
    (m: any) => m.type === 'mods' || m.type === 'mod'
  )
  const modsDir = join(gameDir, 'mods')
  if (existsSync(modsDir)) {
    for (const f of readdirSync(modsDir)) {
      try { rmSync(join(modsDir, f), { force: true }) } catch { /* skip locked files */ }
    }
  }
  mkdirSync(modsDir, { recursive: true })

  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i]
    if (!mod.url) continue
    const fileName = mod.file ?? `${(mod.name ?? `mod_${i}`).replace(/[^A-Za-z0-9._-]/g, '_')}.jar`
    const destPath = join(modsDir, fileName)
    if (!existsSync(destPath)) {
      try {
        await downloadToFile(mod.url, destPath)
      } catch { /* skip mods that fail */ }
    }
    onProgress(`Downloading mods… (${i + 1}/${mods.length})`, Math.round(((i + 1) / mods.length) * 80))
  }

  // Download and extract config overrides
  const configsUrl = `${ATL_CDN}/packs/${safeName}/versions/${targetVersion}/Configs.zip`
  try {
    onProgress('Downloading configs…', 85)
    const configRes = await fetch(configsUrl, { headers: { 'User-Agent': ATL_INST_UA } })
    if (configRes.ok) {
      onProgress('Extracting configs…', 90)
      const configBuf = Buffer.from(await configRes.arrayBuffer())
      const configZip = new AdmZip(configBuf)
      configZip.extractAllTo(gameDir, true)
    }
  } catch { /* configs zip might not exist for all packs */ }

  const marker: PackMarker = {
    packVersionId: targetVersion,
    loaderType,
    loaderVersion
  }
  writeMarker(instanceId, marker)
  return marker
}

// ── Technic pack ─────────────────────────────────────────────────────────────

const TECHNIC_API_INST = 'https://api.technicpack.net'
const TECHNIC_INST_UA  = 'Mozilla/5.0 TechnicLauncher/4.0.0'

export async function installTechnicPack(
  instanceId: string,
  slug: string,
  packVersionId: string | undefined,
  onProgress: (msg: string, pct?: number) => void
): Promise<PackMarker> {
  const gameDir = instanceGameDir(instanceId)

  onProgress('Fetching modpack info…')
  const packRes = await fetch(`${TECHNIC_API_INST}/modpack/${slug}?build=latest`, {
    headers: { 'User-Agent': TECHNIC_INST_UA }
  })
  if (!packRes.ok) throw new Error(`Technic ${packRes.status}`)
  const pack = await packRes.json() as any

  const targetBuild = packVersionId ?? pack.recommended ?? pack.currentBuild
  if (!targetBuild) throw new Error('No build available for this Technic pack')

  const loaderType = pack.forge ? 'forge' : 'vanilla'
  const rawForge: string = pack.forge ?? ''
  const loaderVersion: string | undefined = rawForge ? rawForge.replace(/^forge-/, '') : undefined

  if (pack.solder) {
    onProgress('Fetching build details…')
    const solderRes = await fetch(`${pack.solder}/api/modpack/${slug}/${targetBuild}`, {
      headers: { 'User-Agent': TECHNIC_INST_UA }
    })
    if (!solderRes.ok) throw new Error(`Solder API ${solderRes.status}`)
    const build = await solderRes.json() as any

    const mods: any[] = build.mods ?? []
    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i]
      if (!mod.url) continue
      onProgress(`Downloading ${mod.name ?? `mod ${i + 1}`}…`, Math.round((i / mods.length) * 90))
      try {
        const modRes = await fetch(mod.url)
        if (!modRes.ok) continue
        const buf = Buffer.from(await modRes.arrayBuffer())
        const zip = new AdmZip(buf)
        zip.extractAllTo(gameDir, true)
      } catch { /* skip */ }
    }
  } else {
    onProgress('Downloading modpack archive…')
    const downloadUrl = `${TECHNIC_API_INST}/modpack/${slug}/download/${targetBuild}`
    const packZipRes = await fetch(downloadUrl, {
      headers: { 'User-Agent': TECHNIC_INST_UA },
      redirect: 'follow'
    })
    if (!packZipRes.ok) throw new Error(`Technic download ${packZipRes.status}`)
    const buf = Buffer.from(await packZipRes.arrayBuffer())
    onProgress('Extracting modpack…', 85)
    const zip = new AdmZip(buf)
    zip.extractAllTo(gameDir, true)
  }

  injectServersDat(gameDir)

  const marker: PackMarker = { packVersionId: targetBuild, loaderType, loaderVersion }
  writeMarker(instanceId, marker)
  return marker
}

// ── CurseForge zip ────────────────────────────────────────────────────────────

export async function installCfPack(
  instanceId: string,
  modId: string,
  fileId: string | undefined,
  onProgress: (msg: string, pct?: number) => void
): Promise<PackMarker> {
  const gameDir = instanceGameDir(instanceId)
  const cfKey = getSettings().curseforgeApiKey
  if (!cfKey) throw new Error('A CurseForge API key is required — add it in Settings → API Keys')

  const cfH = { 'x-api-key': cfKey, Accept: 'application/json' }

  onProgress('Fetching modpack info…')
  let fileData: any
  if (fileId) {
    const res = await fetch(`${CF_BASE}/mods/${modId}/files/${fileId}`, { headers: cfH })
    if (!res.ok) throw new Error(`CurseForge ${res.status}`)
    fileData = (await res.json() as any).data
  } else {
    const res = await fetch(`${CF_BASE}/mods/${modId}/files?pageSize=1&sortField=1&sortOrder=desc`, { headers: cfH })
    if (!res.ok) throw new Error(`CurseForge ${res.status}`)
    fileData = (await res.json() as any).data?.[0]
  }

  if (!fileData?.downloadUrl) throw new Error('This CurseForge file has no public download URL')

  onProgress('Downloading modpack archive…')
  const packRes = await fetch(fileData.downloadUrl, { headers: { 'User-Agent': UA } })
  if (!packRes.ok) throw new Error(`Failed to download pack: ${packRes.status}`)
  const packBuf = Buffer.from(await packRes.arrayBuffer())

  const zip = new AdmZip(packBuf)
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

  // Download mods — wipe the directory first so stale mods from a previous
  // version don't end up alongside the new version's mods (duplicate JARs crash NeoForge).
  const modEntries: Array<{ projectID: number; fileID: number; required: boolean }> =
    (manifest.files ?? []).filter((m: any) => m.required)
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

  for (let i = 0; i < modEntries.length; i += BATCH) {
    const batch = modEntries.slice(i, i + BATCH)
    const res = await fetch(`${CF_BASE}/mods/files`, {
      method: 'POST',
      headers: { ...cfH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: batch.map((m) => m.fileID) })
    })
    const files = (await res.json() as any).data as any[] ?? []

    for (const file of files) {
      done++
      if (!file.downloadUrl) continue
      const dest = join(modsDir, file.fileName)
      if (existsSync(dest)) continue
      try {
        await downloadToFile(file.downloadUrl, dest)
      } catch { /* skip mods that fail */ }
      const pct = Math.round((done / modEntries.length) * 85)
      onProgress(`Downloading mods… (${done}/${modEntries.length})`, pct)
    }
  }

  // Extract overrides
  onProgress('Extracting config overrides…', 90)
  const overridePrefix = `${manifest.overrides ?? 'overrides'}/`
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith(overridePrefix) || entry.isDirectory) continue
    const rel = entry.entryName.slice(overridePrefix.length)
    const dest = join(gameDir, ...rel.split('/'))
    const destDir = join(dest, '..')
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
    writeFileSync(dest, entry.getData())
  }

  injectServersDat(gameDir)

  const marker: PackMarker = {
    packVersionId: String(fileData.id),
    loaderType,
    loaderVersion
  }
  writeMarker(instanceId, marker)
  return marker
}
