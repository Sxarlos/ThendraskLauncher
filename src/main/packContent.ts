import { createHash } from 'crypto'
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { ContentKind, ContentFile, ContentSearchOptions, ModSearchResult, ShaderEngine } from '@shared/types'
import { modrinthSort, validateContentSearch } from './contentDiscovery'
import { getInstance, instanceGameDir } from './instances'
import { safeJoin } from './safePath'
import { assertCurseForgeSourceAllowed } from './curseforgePolicy'
import { resolveCurseForgePack, searchCurseForgeContent } from './curseForgeContent'

type ContentSource = 'modrinth' | 'curseforge'

const API = 'https://api.modrinth.com/v2'
const UA = 'thendrask-launcher (github.com/Sxarlos/ThendraskLauncher)'

function contentDir(instanceId: string, kind: ContentKind): string {
  if (!getInstance(instanceId)) throw new Error('Instance not found.')
  if (kind !== 'resourcepack' && kind !== 'shader') throw new Error('Invalid content type.')
  const dir = join(instanceGameDir(instanceId), kind === 'shader' ? 'shaderpacks' : 'resourcepacks')
  mkdirSync(dir, { recursive: true })
  return dir
}

function engineFilter(kind: ContentKind, engine: ShaderEngine): string | undefined {
  if (kind !== 'shader') return undefined
  if (!['iris', 'optifine', 'canvas'].includes(engine)) throw new Error('Invalid shader engine.')
  return engine
}

async function getJson<T>(url: URL | string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Modrinth returned HTTP ${res.status}`)
  return res.json() as Promise<T>
}

function filePath(dir: string, name: string): string {
  if (typeof name !== 'string' || basename(name) !== name || /[\\/:]/.test(name) || !/\.zip(?:\.disabled)?$/i.test(name)) {
    throw new Error('Invalid pack filename.')
  }
  const path = safeJoin(dir, name)
  if (!path) throw new Error('Invalid pack filename.')
  return path
}

interface PackRecord { projectId: string; title: string; source?: ContentSource }
function metadata(dir: string): Record<string, PackRecord> {
  try { return JSON.parse(readFileSync(join(dir, '.thendrask-content.json'), 'utf8')) } catch { return {} }
}

export function listPackContent(instanceId: string, kind: ContentKind): ContentFile[] {
  const dir = contentDir(instanceId, kind)
  const records = metadata(dir)
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.zip(?:\.disabled)?$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      enabled: !entry.name.endsWith('.disabled'),
      size: statSync(join(dir, entry.name)).size,
      ...records[entry.name.replace(/\.disabled$/, '')]
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function searchPackContent(instanceId: string, kind: ContentKind, query: string, engine: ShaderEngine = 'iris', options: ContentSearchOptions = {}, source: ContentSource = 'modrinth'): Promise<ModSearchResult[]> {
  assertCurseForgeSourceAllowed(source)
  contentDir(instanceId, kind)
  if (typeof query !== 'string' || query.length > 200) throw new Error('Invalid content search.')
  if (source === 'curseforge') return searchCurseForgeContent(kind, getInstance(instanceId)!.mcVersion, query, options)
  const facets = [[`project_type:${kind}`], [`versions:${getInstance(instanceId)!.mcVersion}`]]
  const filter = engineFilter(kind, engine)
  if (filter) facets.push([`categories:${filter}`])
  validateContentSearch(options)
  if (options.category) facets.push([`categories:${options.category}`])
  const url = new URL(`${API}/search`)
  url.searchParams.set('query', query.trim())
  url.searchParams.set('facets', JSON.stringify(facets))
  url.searchParams.set('limit', '30')
  url.searchParams.set('offset', String(options.offset ?? 0))
  url.searchParams.set('index', modrinthSort(query, options))
  const data = await getJson<{ hits: Array<{ project_id: string; title: string; description: string; icon_url?: string; downloads: number }> }>(url)
  return data.hits.map((hit) => ({ source: 'modrinth', projectId: hit.project_id, title: hit.title, description: hit.description, iconUrl: hit.icon_url, downloads: hit.downloads }))
}

export async function installPackContent(instanceId: string, kind: ContentKind, projectId: string, engine: ShaderEngine = 'iris', source: ContentSource = 'modrinth'): Promise<ContentFile[]> {
  assertCurseForgeSourceAllowed(source)
  const dir = contentDir(instanceId, kind)
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(projectId)) throw new Error('Invalid project ID.')
  if (source === 'curseforge') {
    const file = await resolveCurseForgePack(kind, getInstance(instanceId)!.mcVersion, projectId)
    await downloadPackFile(dir, file, { projectId, title: file.title, source })
    return listPackContent(instanceId, kind)
  }
  const filter = engineFilter(kind, engine)
  const project = await getJson<{ title: string; project_type: string }>(`${API}/project/${encodeURIComponent(projectId)}`)
  if (project.project_type !== kind) throw new Error('This project is a different content type.')
  const url = new URL(`${API}/project/${encodeURIComponent(projectId)}/version`)
  url.searchParams.set('game_versions', JSON.stringify([getInstance(instanceId)!.mcVersion]))
  if (filter) url.searchParams.set('loaders', JSON.stringify([filter]))
  const versions = await getJson<Array<{ files: Array<{ filename: string; url: string; primary?: boolean; hashes: { sha512?: string; sha1?: string } }> }>>(url)
  const file = versions[0]?.files.find((file) => file.primary && /\.zip$/i.test(file.filename))
    ?? versions[0]?.files.find((file) => /\.zip$/i.test(file.filename))
  if (!file) throw new Error('No compatible ZIP is available for this Minecraft version and shader engine.')
  await downloadPackFile(dir, file, { projectId, title: project.title, source })
  return listPackContent(instanceId, kind)
}

async function downloadPackFile(dir: string, file: { filename: string; url: string; hashes: { sha512?: string; sha1?: string; md5?: string } }, record: PackRecord): Promise<void> {
  const destination = filePath(dir, file.filename)
  if (existsSync(destination) || existsSync(`${destination}.disabled`)) throw new Error('This pack file is already installed.')
  const res = await fetch(file.url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  const algorithm = file.hashes.sha512 ? 'sha512' : file.hashes.sha1 ? 'sha1' : 'md5'
  const expected = file.hashes[algorithm]
  if (!expected || createHash(algorithm).update(bytes).digest('hex').toLowerCase() !== expected.toLowerCase()) throw new Error('Pack checksum verification failed.')
  const temp = `${destination}.tmp`
  try {
    writeFileSync(temp, bytes, { flag: 'wx' })
    renameSync(temp, destination)
  } finally { rmSync(temp, { force: true }) }
  const records = metadata(dir)
  records[file.filename] = record
  writeFileSync(join(dir, '.thendrask-content.json'), JSON.stringify(records, null, 2))
}

export function importPackContent(instanceId: string, kind: ContentKind, source: string): ContentFile[] {
  const dir = contentDir(instanceId, kind)
  const destination = filePath(dir, basename(source))
  if (!/\.zip$/i.test(source)) throw new Error('Choose a ZIP file.')
  if (existsSync(`${destination}.disabled`)) throw new Error('This pack is already installed and disabled.')
  copyFileSync(source, destination, constants.COPYFILE_EXCL)
  const records = metadata(dir)
  delete records[basename(source)]
  writeFileSync(join(dir, '.thendrask-content.json'), JSON.stringify(records, null, 2))
  return listPackContent(instanceId, kind)
}

export function togglePackContent(instanceId: string, kind: ContentKind, name: string): ContentFile[] {
  const dir = contentDir(instanceId, kind)
  const from = filePath(dir, name)
  const to = name.endsWith('.disabled') ? from.slice(0, -9) : `${from}.disabled`
  if (existsSync(to)) throw new Error('A pack with that filename already exists.')
  renameSync(from, to)
  return listPackContent(instanceId, kind)
}

export function removePackContent(instanceId: string, kind: ContentKind, name: string): ContentFile[] {
  const dir = contentDir(instanceId, kind)
  rmSync(filePath(dir, name))
  const records = metadata(dir)
  delete records[name.replace(/\.disabled$/, '')]
  writeFileSync(join(dir, '.thendrask-content.json'), JSON.stringify(records, null, 2))
  return listPackContent(instanceId, kind)
}
