/**
 * Modpack installation — downloads mod files and determines the correct loader version.
 * Called from launcher.ts during the 'preparing' phase on first launch (or after a version switch).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { instanceGameDir } from './instances'
import { getSettings } from './settings'

const MR_BASE = 'https://api.modrinth.com/v2'
const CF_BASE = 'https://api.curseforge.com/v1'
const UA = 'ender-client/0.1.5 (ender-client)'

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

// ── servers.dat injection ─────────────────────────────────────────────────────
// Writes Minecraft's multiplayer server list (NBT format) so the permanent
// servers appear in-game the first time a player opens the Multiplayer screen.

const INJECTED_SERVERS = [
  { name: "Hype's ATM 10 Server",     ip: 'REDACTED' },
  { name: "US - Hype's ATM 10 Server", ip: 'REDACTED' },
]

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

  // Download client-side mod files
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

  // Download mods
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
