import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { LocalMod, ModInstallResult, ModSearchResult } from '@shared/types'
import { getInstance, instanceGameDir } from './instances'
import { safeJoin } from './safePath'
import { createSnapshot, restoreSnapshot } from './snapshots'
import { getSettings } from './settings'

const API = 'https://api.modrinth.com/v2'
const CF_API = 'https://api.curseforge.com/v1'
const UA = 'thendrask-launcher (github.com/Sxarlos/ThendraskLauncher)'
type ModSource = 'modrinth' | 'curseforge'

interface InstalledRecord {
  source?: 'modrinth' | 'curseforge'
  projectId: string
  versionId: string
  fileName: string
  displayName: string
  iconUrl?: string
}

interface ModrinthFile {
  url: string
  filename: string
  primary?: boolean
  hashes?: { sha512?: string; sha1?: string }
}

interface ModrinthDependency {
  project_id?: string
  version_id?: string
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  files: ModrinthFile[]
  dependencies?: ModrinthDependency[]
}

interface CurseForgeFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  downloadUrl?: string
  hashes?: Array<{ value: string; algo: 1 | 2 }>
  dependencies?: Array<{ modId: number; relationType: number }>
}

function metadataPath(instanceId: string): string {
  return join(instanceGameDir(instanceId), '.thendrask-custom-mods.json')
}

function readMetadata(instanceId: string): InstalledRecord[] {
  try {
    return JSON.parse(readFileSync(metadataPath(instanceId), 'utf-8')) as InstalledRecord[]
  } catch {
    return []
  }
}

function writeMetadata(instanceId: string, records: InstalledRecord[]): void {
  const path = metadataPath(instanceId)
  const temp = `${path}.tmp`
  writeFileSync(temp, JSON.stringify(records, null, 2), 'utf-8')
  renameSync(temp, path)
}

function recordSource(record: InstalledRecord): ModSource {
  return record.source ?? 'modrinth'
}

function recordKey(source: ModSource, projectId: string): string {
  return `${source}:${projectId}`
}

function requireModdedInstance(instanceId: string) {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('Instance not found.')
  if (instance.loader === 'vanilla') throw new Error('Choose Fabric, Forge, NeoForge, or Quilt before adding mods.')
  return instance
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`Modrinth returned HTTP ${response.status}`)
  return response.json() as Promise<T>
}

function loaderFilters(loader: string): string[] {
  return loader === 'quilt' ? ['quilt', 'fabric'] : [loader]
}

function curseForgeLoader(loader: string): number {
  const values: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
  const value = values[loader]
  if (!value) throw new Error(`CurseForge does not support the ${loader} loader for custom mods.`)
  return value
}

function curseForgeHeaders(): Record<string, string> {
  const key = getSettings().curseforgeApiKey
  if (!key) throw new Error('Add a CurseForge API key in Settings before browsing CurseForge mods.')
  return { 'x-api-key': key, Accept: 'application/json' }
}

async function cfJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: curseForgeHeaders() })
  if (!response.ok) throw new Error(`CurseForge returned HTTP ${response.status}`)
  return response.json() as Promise<T>
}

function validateProjectId(projectId: string): void {
  if (typeof projectId !== 'string' || projectId.length < 1 || projectId.length > 80) {
    throw new Error('Invalid Modrinth project ID.')
  }
}

async function searchModrinthMods(instanceId: string, query: string): Promise<ModSearchResult[]> {
  const instance = requireModdedInstance(instanceId)
  if (typeof query !== 'string' || query.length > 200) throw new Error('Invalid mod search.')
  const facets = [
    ['project_type:mod'],
    [`versions:${instance.mcVersion}`],
    loaderFilters(instance.loader).map((loader) => `categories:${loader}`),
    ['client_side!=unsupported']
  ]
  const url = new URL(`${API}/search`)
  url.searchParams.set('query', query.trim())
  url.searchParams.set('facets', JSON.stringify(facets))
  url.searchParams.set('limit', '30')
  url.searchParams.set('index', 'relevance')
  const data = await getJson<{ hits?: Array<Record<string, unknown>> }>(url.toString())
  return (data.hits ?? []).map((hit) => ({
    source: 'modrinth' as const,
    projectId: String(hit.project_id ?? ''),
    title: String(hit.title ?? 'Unknown mod'),
    description: String(hit.description ?? ''),
    iconUrl: typeof hit.icon_url === 'string' ? hit.icon_url : undefined,
    author: typeof hit.author === 'string' ? hit.author : undefined,
    downloads: typeof hit.downloads === 'number' ? hit.downloads : 0
  })).filter((result) => result.projectId)
}

async function searchCurseForgeMods(instanceId: string, query: string): Promise<ModSearchResult[]> {
  const instance = requireModdedInstance(instanceId)
  if (typeof query !== 'string' || query.length > 200) throw new Error('Invalid mod search.')
  const url = new URL(`${CF_API}/mods/search`)
  url.searchParams.set('gameId', '432')
  url.searchParams.set('classId', '6')
  url.searchParams.set('gameVersion', instance.mcVersion)
  url.searchParams.set('modLoaderType', String(curseForgeLoader(instance.loader)))
  url.searchParams.set('searchFilter', query.trim())
  url.searchParams.set('sortField', '2')
  url.searchParams.set('sortOrder', 'desc')
  url.searchParams.set('pageSize', '30')
  const result = await cfJson<{ data?: Array<Record<string, unknown>> }>(url.toString())
  return (result.data ?? []).map((mod) => {
    const logo = mod.logo as Record<string, unknown> | undefined
    const authors = mod.authors as Array<Record<string, unknown>> | undefined
    return {
      source: 'curseforge' as const,
      projectId: String(mod.id ?? ''),
      title: String(mod.name ?? 'Unknown mod'),
      description: String(mod.summary ?? ''),
      iconUrl: typeof logo?.thumbnailUrl === 'string' ? logo.thumbnailUrl : undefined,
      author: typeof authors?.[0]?.name === 'string' ? String(authors[0].name) : undefined,
      downloads: typeof mod.downloadCount === 'number' ? mod.downloadCount : 0
    }
  }).filter((mod) => mod.projectId)
}

export async function searchCompatibleMods(instanceId: string, query: string, source: ModSource = 'modrinth'): Promise<ModSearchResult[]> {
  return source === 'curseforge'
    ? searchCurseForgeMods(instanceId, query)
    : searchModrinthMods(instanceId, query)
}

async function compatibleVersions(instanceId: string, projectId: string): Promise<ModrinthVersion[]> {
  const instance = requireModdedInstance(instanceId)
  validateProjectId(projectId)
  const url = new URL(`${API}/project/${encodeURIComponent(projectId)}/version`)
  url.searchParams.set('game_versions', JSON.stringify([instance.mcVersion]))
  url.searchParams.set('loaders', JSON.stringify(loaderFilters(instance.loader)))
  url.searchParams.set('include_changelog', 'false')
  return getJson<ModrinthVersion[]>(url.toString())
}

async function projectTitle(projectId: string): Promise<{ title: string; iconUrl?: string }> {
  const project = await getJson<Record<string, unknown>>(`${API}/project/${encodeURIComponent(projectId)}`)
  return {
    title: typeof project.title === 'string' ? project.title : projectId,
    iconUrl: typeof project.icon_url === 'string' ? project.icon_url : undefined
  }
}

async function downloadVersion(
  instanceId: string,
  version: ModrinthVersion,
  records: Map<string, InstalledRecord>,
  visited: Set<string>
): Promise<number> {
  if (visited.has(version.project_id)) return 0
  visited.add(version.project_id)
  let added = 0

  for (const dependency of version.dependencies ?? []) {
    if (dependency.dependency_type !== 'required') continue
    let dependencyVersion: ModrinthVersion | undefined
    if (dependency.version_id) {
      dependencyVersion = await getJson<ModrinthVersion>(`${API}/version/${encodeURIComponent(dependency.version_id)}`)
    } else if (dependency.project_id) {
      dependencyVersion = (await compatibleVersions(instanceId, dependency.project_id))[0]
    }
    if (!dependencyVersion) throw new Error('A required dependency has no compatible version.')
    added += await downloadVersion(instanceId, dependencyVersion, records, visited)
  }

  const file = version.files.find((candidate) => candidate.primary) ?? version.files.find((candidate) => candidate.filename.endsWith('.jar'))
  if (!file) throw new Error(`No client JAR found for ${version.name}`)
  const originalFileName = basename(file.filename)
  if (!originalFileName.endsWith('.jar')) throw new Error(`Unsafe mod filename: ${file.filename}`)
  const modsDir = join(instanceGameDir(instanceId), 'mods')
  mkdirSync(modsDir, { recursive: true })
  const key = recordKey('modrinth', version.project_id)
  const existing = records.get(key)
  const collision = [...records.values()].some((record) => recordKey(recordSource(record), record.projectId) !== key && record.fileName === originalFileName) ||
    ((!existing || existing.fileName !== originalFileName) &&
      (existsSync(join(modsDir, originalFileName)) || existsSync(join(modsDir, `${originalFileName}.disabled`))))
  const safeProjectId = version.project_id.replace(/[^A-Za-z0-9_-]/g, '_')
  const fileName = collision ? `${safeProjectId}-${originalFileName}` : originalFileName
  const enabledDestination = safeJoin(modsDir, fileName)
  if (!enabledDestination) throw new Error(`Unsafe mod filename: ${file.filename}`)
  const wasDisabled = !!existing && existsSync(join(modsDir, `${existing.fileName}.disabled`))
  const destination = wasDisabled ? `${enabledDestination}.disabled` : enabledDestination

  if (existing && existing.versionId === version.id && (existsSync(join(modsDir, existing.fileName)) || existsSync(join(modsDir, `${existing.fileName}.disabled`)))) return added

  const response = await fetch(file.url, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`Failed to download ${fileName}: HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const expected = file.hashes?.sha512 ?? file.hashes?.sha1
  const algorithm = file.hashes?.sha512 ? 'sha512' : file.hashes?.sha1 ? 'sha1' : null
  if (expected && algorithm) {
    const actual = createHash(algorithm).update(buffer).digest('hex')
    if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`Checksum verification failed for ${fileName}`)
  }

  writeFileSync(destination, buffer)
  if (existing && existing.fileName !== fileName) {
    rmSync(join(modsDir, existing.fileName), { force: true })
    rmSync(join(modsDir, `${existing.fileName}.disabled`), { force: true })
  }
  const project = await projectTitle(version.project_id)
  records.set(key, {
    source: 'modrinth',
    projectId: version.project_id,
    versionId: version.id,
    fileName,
    displayName: project.title,
    iconUrl: project.iconUrl
  })
  return added + 1
}

async function curseForgeFiles(instanceId: string, projectId: string): Promise<CurseForgeFile[]> {
  const instance = requireModdedInstance(instanceId)
  validateProjectId(projectId)
  const url = new URL(`${CF_API}/mods/${encodeURIComponent(projectId)}/files`)
  url.searchParams.set('gameVersion', instance.mcVersion)
  url.searchParams.set('modLoaderType', String(curseForgeLoader(instance.loader)))
  url.searchParams.set('pageSize', '50')
  const result = await cfJson<{ data?: CurseForgeFile[] }>(url.toString())
  return result.data ?? []
}

async function curseForgeProject(projectId: string): Promise<{ title: string; iconUrl?: string }> {
  const result = await cfJson<{ data?: Record<string, unknown> }>(`${CF_API}/mods/${encodeURIComponent(projectId)}`)
  const logo = result.data?.logo as Record<string, unknown> | undefined
  return {
    title: typeof result.data?.name === 'string' ? result.data.name : projectId,
    iconUrl: typeof logo?.thumbnailUrl === 'string' ? logo.thumbnailUrl : undefined
  }
}

async function downloadCurseForgeFile(
  instanceId: string,
  file: CurseForgeFile,
  records: Map<string, InstalledRecord>,
  visited: Set<string>
): Promise<number> {
  const projectId = String(file.modId)
  const key = recordKey('curseforge', projectId)
  if (visited.has(key)) return 0
  visited.add(key)
  let added = 0
  for (const dependency of file.dependencies ?? []) {
    if (dependency.relationType !== 3) continue
    const dependencyFile = (await curseForgeFiles(instanceId, String(dependency.modId)))[0]
    if (!dependencyFile) throw new Error(`CurseForge dependency ${dependency.modId} has no compatible file.`)
    added += await downloadCurseForgeFile(instanceId, dependencyFile, records, visited)
  }

  if (!file.downloadUrl) {
    throw new Error(`${file.displayName || file.fileName} does not allow third-party downloads. Download it manually from CurseForge and use Add local JAR.`)
  }
  const originalFileName = basename(file.fileName)
  if (!originalFileName.endsWith('.jar')) throw new Error(`Unsafe mod filename: ${file.fileName}`)
  const modsDir = join(instanceGameDir(instanceId), 'mods')
  mkdirSync(modsDir, { recursive: true })
  const existing = records.get(key)
  const collision = [...records.values()].some((record) => recordKey(recordSource(record), record.projectId) !== key && record.fileName === originalFileName) ||
    ((!existing || existing.fileName !== originalFileName) &&
      (existsSync(join(modsDir, originalFileName)) || existsSync(join(modsDir, `${originalFileName}.disabled`))))
  const fileName = collision ? `cf-${projectId}-${originalFileName}` : originalFileName
  const enabledDestination = safeJoin(modsDir, fileName)
  if (!enabledDestination) throw new Error(`Unsafe mod filename: ${file.fileName}`)
  const wasDisabled = !!existing && existsSync(join(modsDir, `${existing.fileName}.disabled`))
  const destination = wasDisabled ? `${enabledDestination}.disabled` : enabledDestination
  const versionId = String(file.id)
  if (existing && existing.versionId === versionId &&
      (existsSync(join(modsDir, existing.fileName)) || existsSync(join(modsDir, `${existing.fileName}.disabled`)))) return added

  const response = await fetch(file.downloadUrl, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`Failed to download ${fileName}: HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const sha1 = file.hashes?.find((hash) => hash.algo === 1)?.value
  const md5 = file.hashes?.find((hash) => hash.algo === 2)?.value
  const expected = sha1 ?? md5
  const algorithm = sha1 ? 'sha1' : md5 ? 'md5' : null
  if (expected && algorithm) {
    const actual = createHash(algorithm).update(buffer).digest('hex')
    if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`Checksum verification failed for ${fileName}`)
  }
  writeFileSync(destination, buffer)
  if (existing && existing.fileName !== fileName) {
    rmSync(join(modsDir, existing.fileName), { force: true })
    rmSync(join(modsDir, `${existing.fileName}.disabled`), { force: true })
  }
  const project = await curseForgeProject(projectId)
  records.set(key, {
    source: 'curseforge',
    projectId,
    versionId,
    fileName,
    displayName: project.title,
    iconUrl: project.iconUrl
  })
  return added + 1
}

async function installModrinthMod(instanceId: string, projectId: string): Promise<ModInstallResult> {
  requireModdedInstance(instanceId)
  validateProjectId(projectId)
  const version = (await compatibleVersions(instanceId, projectId))[0]
  if (!version) throw new Error('This mod has no version compatible with the instance.')
  const snapshot = createSnapshot(instanceId, 'manual', 'Before installing custom mods')
  try {
    const records = new Map(readMetadata(instanceId).map((record) => [recordKey(recordSource(record), record.projectId), record]))
    const addedCount = await downloadVersion(instanceId, version, records, new Set())
    writeMetadata(instanceId, [...records.values()])
    return { installed: listManagedMods(instanceId), addedCount }
  } catch (error) {
    restoreSnapshot(instanceId, snapshot.id)
    throw error
  }
}

async function installCurseForgeMod(instanceId: string, projectId: string): Promise<ModInstallResult> {
  requireModdedInstance(instanceId)
  validateProjectId(projectId)
  const file = (await curseForgeFiles(instanceId, projectId))[0]
  if (!file) throw new Error('This mod has no CurseForge file compatible with the instance.')
  const snapshot = createSnapshot(instanceId, 'manual', 'Before installing CurseForge mods')
  try {
    const records = new Map(readMetadata(instanceId).map((record) => [recordKey(recordSource(record), record.projectId), record]))
    const addedCount = await downloadCurseForgeFile(instanceId, file, records, new Set())
    writeMetadata(instanceId, [...records.values()])
    return { installed: listManagedMods(instanceId), addedCount }
  } catch (error) {
    restoreSnapshot(instanceId, snapshot.id)
    throw error
  }
}

export async function installCompatibleMod(instanceId: string, projectId: string, source: ModSource = 'modrinth'): Promise<ModInstallResult> {
  return source === 'curseforge'
    ? installCurseForgeMod(instanceId, projectId)
    : installModrinthMod(instanceId, projectId)
}

export function listManagedMods(instanceId: string): LocalMod[] {
  const modsDir = join(instanceGameDir(instanceId), 'mods')
  if (!existsSync(modsDir)) return []
  const records = readMetadata(instanceId)
  return records.flatMap((record) => {
    const enabledPath = join(modsDir, record.fileName)
    const disabledPath = join(modsDir, `${record.fileName}.disabled`)
    const path = existsSync(enabledPath) ? enabledPath : existsSync(disabledPath) ? disabledPath : null
    if (!path) return []
    return [{
      name: basename(path),
      size: statSync(path).size,
      enabled: path === enabledPath,
      projectId: record.projectId,
      source: recordSource(record),
      versionId: record.versionId,
      displayName: record.displayName,
      iconUrl: record.iconUrl
    }]
  })
}

export function toggleManagedMod(instanceId: string, source: ModSource, projectId: string, enabled: boolean): LocalMod[] {
  validateProjectId(projectId)
  if (typeof enabled !== 'boolean') throw new Error('Invalid mod state.')
  const record = readMetadata(instanceId).find((item) => recordSource(item) === source && item.projectId === projectId)
  if (!record) throw new Error('Managed mod not found.')
  const modsDir = join(instanceGameDir(instanceId), 'mods')
  const from = join(modsDir, enabled ? `${record.fileName}.disabled` : record.fileName)
  const to = join(modsDir, enabled ? record.fileName : `${record.fileName}.disabled`)
  if (!existsSync(from)) throw new Error('Mod file not found.')
  renameSync(from, to)
  return listManagedMods(instanceId)
}

export function removeManagedMod(instanceId: string, source: ModSource, projectId: string): LocalMod[] {
  validateProjectId(projectId)
  const records = readMetadata(instanceId)
  const record = records.find((item) => recordSource(item) === source && item.projectId === projectId)
  if (!record) throw new Error('Managed mod not found.')
  const modsDir = join(instanceGameDir(instanceId), 'mods')
  rmSync(join(modsDir, record.fileName), { force: true })
  rmSync(join(modsDir, `${record.fileName}.disabled`), { force: true })
  writeMetadata(instanceId, records.filter((item) => recordSource(item) !== source || item.projectId !== projectId))
  return listManagedMods(instanceId)
}

export async function updateManagedMods(instanceId: string): Promise<ModInstallResult> {
  requireModdedInstance(instanceId)
  const current = readMetadata(instanceId)
  if (!current.length) return { installed: [], addedCount: 0 }
  const snapshot = createSnapshot(instanceId, 'manual', 'Before updating custom mods')
  try {
    const records = new Map(current.map((record) => [recordKey(recordSource(record), record.projectId), record]))
    let addedCount = 0
    for (const record of current) {
      if (recordSource(record) === 'modrinth') {
        const version = (await compatibleVersions(instanceId, record.projectId))[0]
        if (version && version.id !== record.versionId) {
          addedCount += await downloadVersion(instanceId, version, records, new Set())
        }
      } else {
        const file = (await curseForgeFiles(instanceId, record.projectId))[0]
        if (file && String(file.id) !== record.versionId) {
          addedCount += await downloadCurseForgeFile(instanceId, file, records, new Set())
        }
      }
    }
    writeMetadata(instanceId, [...records.values()])
    return { installed: listManagedMods(instanceId), addedCount }
  } catch (error) {
    restoreSnapshot(instanceId, snapshot.id)
    throw error
  }
}
