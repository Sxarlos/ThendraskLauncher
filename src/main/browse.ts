import AdmZip from 'adm-zip'
import type { BrowseParams, ModpackResult, PackMod, PackOverview, PackVersion, VersionChangelog } from '@shared/types'
import { getSettings } from './settings'

const CF_BASE = 'https://api.curseforge.com/v1'
const MR_BASE = 'https://api.modrinth.com/v2'

const CF_LOADER: Record<string, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
}

const CF_LOADER_NAME: Record<number, string> = {
  1: 'forge',
  4: 'fabric',
  5: 'quilt',
  6: 'neoforge'
}

const KNOWN_LOADERS = new Set(['fabric', 'forge', 'quilt', 'neoforge', 'liteloader', 'modloader'])

async function mrGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(MR_BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== undefined) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'ender-client/0.1.2 (github.com/ender-client)' }
  })
  if (!res.ok) throw new Error(`Modrinth ${res.status}: ${res.statusText}`)
  return res.json()
}

async function cfGet(path: string, params: Record<string, string | number>): Promise<any> {
  const key = (getSettings().curseforgeApiKey ?? '').trim()
  if (!key) throw new Error('NO_CF_KEY')

  const url = new URL(CF_BASE + path)
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== undefined) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), {
    headers: {
      'x-api-key': key,
      Accept: 'application/json'
    }
  })
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        'CurseForge key rejected (403). Common causes: ' +
        '(1) wrong key — go to console.curseforge.com → API Keys and copy the full key starting with $2a$10$; ' +
        '(2) new keys can take a few minutes to activate after creation; ' +
        '(3) go to Settings → API Keys in Ender Client and re-paste the key.'
      )
    }
    throw new Error(`CurseForge ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

export async function searchModrinth(params: BrowseParams): Promise<ModpackResult[]> {
  const facets: string[][] = [['project_type:modpack']]
  if (params.loader) facets.push([`categories:${params.loader}`])
  if (params.mcVersion) facets.push([`versions:${params.mcVersion}`])

  const data = await mrGet('/search', {
    query: params.query ?? '',
    facets: JSON.stringify(facets),
    limit: String(params.limit ?? 20),
    offset: String(params.offset ?? 0),
    index: params.query ? 'relevance' : 'downloads'
  })

  return (data.hits ?? []).map((h: any): ModpackResult => {
    const cats: string[] = h.categories ?? []
    const loaders = cats.filter((c) => KNOWN_LOADERS.has(c))
    const displayCats = (h.display_categories ?? cats).filter((c: string) => !KNOWN_LOADERS.has(c))

    return {
      id: h.project_id,
      name: h.title,
      description: h.description,
      iconUrl: h.icon_url || undefined,
      downloads: h.downloads ?? 0,
      categories: displayCats,
      mcVersions: (h.versions ?? []).slice().sort().reverse(),
      loaders,
      source: 'modrinth',
      externalUrl: `https://modrinth.com/modpack/${h.slug}`,
      author: h.author
    }
  })
}

/** Fetch gallery screenshots for a Modrinth project (up to 8 images). */
export async function fetchModrinthScreenshots(projectId: string): Promise<string[]> {
  const data = await mrGet(`/project/${projectId}`, {})
  const gallery: Array<{ url: string; featured?: boolean }> = data.gallery ?? []
  gallery.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
  return gallery.map((g) => g.url).filter(Boolean).slice(0, 8)
}

/** Fetch screenshots for a CurseForge mod. */
export async function fetchCurseForgeScreenshots(modId: string): Promise<string[]> {
  const data = await cfGet(`/mods/${modId}`, {})
  const shots: Array<{ url?: string; thumbnailUrl?: string }> = data.data?.screenshots ?? []
  return shots.map((s) => s.url ?? s.thumbnailUrl ?? '').filter(Boolean).slice(0, 8)
}

/** Fetch full overview (description + gallery + meta) for a Modrinth project. */
export async function fetchModrinthPackOverview(projectId: string): Promise<PackOverview> {
  const data = await mrGet(`/project/${projectId}`, {})
  const gallery: Array<{ url: string; featured?: boolean }> = data.gallery ?? []
  gallery.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
  return {
    description: data.body ?? data.description ?? '',
    screenshotUrls: gallery.map((g) => g.url).filter(Boolean).slice(0, 12),
    externalUrl: data.slug ? `https://modrinth.com/modpack/${data.slug}` : undefined,
    downloads: data.downloads,
    author: data.author ?? undefined
  }
}

/** Fetch full overview for a CurseForge mod. */
export async function fetchCurseForgePackOverview(modId: string): Promise<PackOverview> {
  const data = await cfGet(`/mods/${modId}`, {})
  const d = data.data ?? {}
  const shots: Array<{ url?: string; thumbnailUrl?: string }> = d.screenshots ?? []
  return {
    description: d.summary ?? '',
    screenshotUrls: shots.map((s) => s.url ?? s.thumbnailUrl ?? '').filter(Boolean).slice(0, 12),
    externalUrl: d.links?.websiteUrl ?? undefined,
    downloads: d.downloadCount ?? undefined,
    author: d.authors?.[0]?.name ?? undefined
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function cfPost(path: string, body: unknown): Promise<any> {
  const key = (getSettings().curseforgeApiKey ?? '').trim()
  if (!key) throw new Error('NO_CF_KEY')
  const res = await fetch(CF_BASE + path, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) {
      throw new Error('CurseForge API key is invalid or not authorised. Go to Settings → CurseForge and re-enter your key from console.curseforge.com → API Keys.')
    }
    throw new Error(`CurseForge ${res.status}: ${res.statusText}`)
  }
  return res.json()
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ender-client/0.1.2 (github.com/ender-client)' }
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function extractJsonFromZip(buf: Buffer, filename: string): any {
  const zip = new AdmZip(buf)
  const entry = zip.getEntry(filename)
  if (!entry) throw new Error(`${filename} not found in archive`)
  return JSON.parse(entry.getData().toString('utf8'))
}

function mrProjectIdFromUrl(url: string): string | null {
  const m = url.match(/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\//)
  return m?.[1] ?? null
}

const MC_VERSION_RE = /^\d+\.\d+/
const CF_LOADER_WORDS = new Set(['Forge', 'Fabric', 'NeoForge', 'Quilt', 'LiteLoader', 'Modloader'])

// ── Version lists ─────────────────────────────────────────────────────────────

export async function fetchModrinthVersions(projectId: string): Promise<PackVersion[]> {
  const data: any[] = await mrGet(`/project/${projectId}/version`, {})
  return data.map((v: any): PackVersion => ({
    id: v.id,
    versionNumber: v.version_number,
    name: v.name,
    gameVersions: v.game_versions ?? [],
    loaders: v.loaders ?? [],
    datePublished: v.date_published ?? ''
  }))
}

export async function fetchCurseForgeVersions(modId: string): Promise<PackVersion[]> {
  const data = await cfGet(`/mods/${modId}/files`, { pageSize: 50, sortField: 1, sortOrder: 'desc' })
  return (data.data ?? []).map((f: any): PackVersion => {
    const allVers: string[] = f.gameVersions ?? []
    return {
      id: String(f.id),
      versionNumber: f.displayName ?? String(f.id),
      name: f.displayName ?? String(f.id),
      gameVersions: allVers.filter((v) => MC_VERSION_RE.test(v)),
      loaders: allVers
        .filter((v) => CF_LOADER_WORDS.has(v))
        .map((v) => v.toLowerCase()),
      datePublished: f.fileDate ?? ''
    }
  })
}

// ── Mod lists ─────────────────────────────────────────────────────────────────

export async function fetchModrinthMods(projectId: string, versionId?: string): Promise<PackMod[]> {
  let versionData: any
  if (versionId) {
    versionData = await mrGet(`/version/${versionId}`, {})
  } else {
    const versions: any[] = await mrGet(`/project/${projectId}/version`, {})
    if (!versions.length) return []
    versionData = versions[0]
  }

  const fileUrl: string | undefined =
    (versionData.files as any[])?.find((f: any) => f.primary || f.filename?.endsWith('.mrpack'))?.url
    ?? versionData.files?.[0]?.url
  if (!fileUrl) return []

  const buf = await downloadBuffer(fileUrl)
  const index = extractJsonFromZip(buf, 'modrinth.index.json')
  const files: any[] = index.files ?? []

  const projectIds = [
    ...new Set(
      files
        .map((f: any) => f.downloads?.[0])
        .filter(Boolean)
        .map(mrProjectIdFromUrl)
        .filter((id): id is string => id !== null)
    )
  ].slice(0, 500)

  const projectMap: Record<string, { title: string; icon_url?: string }> = {}
  if (projectIds.length > 0) {
    try {
      const projects: any[] = await mrGet('/projects', { ids: JSON.stringify(projectIds) })
      for (const p of projects) projectMap[p.id] = { title: p.title, icon_url: p.icon_url }
    } catch (_) {}
  }

  return files
    .filter((f: any) => typeof f.path === 'string' && f.path.startsWith('mods/'))
    .map((f: any): PackMod => {
      const cdnUrl: string = f.downloads?.[0] ?? ''
      const projId = mrProjectIdFromUrl(cdnUrl)
      const pd = projId ? projectMap[projId] : undefined

      const filename = (f.path as string).split('/').pop() ?? ''
      const rawName = filename.replace(/\.jar$/i, '').split(/[-_+]/)[0]
      const nameFromFile = rawName.charAt(0).toUpperCase() + rawName.slice(1)

      return {
        name: pd?.title ?? nameFromFile,
        optional: f.env?.client === 'optional',
        serverOnly: f.env?.client === 'unsupported',
        iconUrl: pd?.icon_url
      }
    })
}

export async function fetchCurseFormMods(modId: string, fileId?: string): Promise<PackMod[]> {
  let targetFileId = fileId ? parseInt(fileId, 10) : undefined
  if (!targetFileId) {
    const listData = await cfGet(`/mods/${modId}/files`, { pageSize: 1, sortField: 1, sortOrder: 'desc' })
    targetFileId = listData.data?.[0]?.id as number | undefined
    if (!targetFileId) return []
  }

  const fileData = await cfGet(`/mods/${modId}/files/${targetFileId}`, {})
  const downloadUrl: string | null = fileData.data?.downloadUrl ?? null
  if (!downloadUrl) return []

  const buf = await downloadBuffer(downloadUrl)
  const manifest = extractJsonFromZip(buf, 'manifest.json')
  const files: Array<{ projectID: number; fileID: number; required: boolean }> = manifest.files ?? []

  const modIds = [...new Set(files.map((f) => f.projectID))]
  const modMap: Record<number, { name: string; logo?: { thumbnailUrl?: string } }> = {}
  if (modIds.length > 0) {
    try {
      const batchData = await cfPost('/mods', { modIds })
      for (const m of batchData.data ?? []) modMap[m.id] = m
    } catch (_) {}
  }

  return files.map((f): PackMod => {
    const m = modMap[f.projectID]
    return {
      name: m?.name ?? `Mod #${f.projectID}`,
      optional: !f.required,
      serverOnly: false,
      iconUrl: m?.logo?.thumbnailUrl
    }
  })
}

// ── Changelog helpers ─────────────────────────────────────────────────────────

/** Strip HTML to plain text for CurseForge changelogs. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/?(h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Fetch the last N version changelogs for a Modrinth project. */
export async function fetchModrinthChangelog(projectId: string, limit = 10): Promise<VersionChangelog[]> {
  const data: any[] = await mrGet(`/project/${projectId}/version`, {})
  return data.slice(0, limit).map((v: any): VersionChangelog => ({
    id: v.id,
    versionNumber: v.version_number ?? '',
    name: v.name ?? v.version_number ?? '',
    datePublished: v.date_published ?? '',
    changelog: (v.changelog ?? '').trim()
  }))
}

/** Fetch the last N version changelogs for a CurseForge mod. */
export async function fetchCurseForgeChangelog(modId: string, limit = 5): Promise<VersionChangelog[]> {
  const listData = await cfGet(`/mods/${modId}/files`, { pageSize: limit, sortField: 1, sortOrder: 'desc' })
  const files: any[] = listData.data ?? []

  const entries = await Promise.all(
    files.map(async (f: any): Promise<VersionChangelog> => {
      let changelog = ''
      try {
        const clData = await cfGet(`/mods/${modId}/files/${f.id}/changelog`, {})
        changelog = stripHtml(clData.data ?? '')
      } catch { /* changelog unavailable */ }
      const allVers: string[] = f.gameVersions ?? []
      const mcVer = allVers.find((v: string) => /^\d+\.\d+/.test(v)) ?? ''
      return {
        id: String(f.id),
        versionNumber: f.displayName ?? String(f.id),
        name: f.displayName ?? String(f.id),
        datePublished: f.fileDate ?? '',
        changelog
      }
    })
  )
  return entries
}

// ── Version detail helpers (for switch-version IPC) ───────────────────────────

export async function getModrinthVersionDetails(versionId: string): Promise<{ mcVersion: string }> {
  const data = await mrGet(`/version/${versionId}`, {})
  return { mcVersion: (data.game_versions as string[])?.[0] ?? '' }
}

export async function getCurseForgeFileDetails(
  modId: string,
  fileId: string
): Promise<{ mcVersion: string }> {
  const data = await cfGet(`/mods/${modId}/files/${fileId}`, {})
  const allVers: string[] = data.data?.gameVersions ?? []
  return { mcVersion: allVers.find((v) => MC_VERSION_RE.test(v)) ?? '' }
}

export async function searchCurseForge(params: BrowseParams): Promise<ModpackResult[]> {
  const p: Record<string, string | number> = {
    gameId: 432,
    classId: 4471,
    sortField: 2,
    sortOrder: 'desc',
    pageSize: params.limit ?? 20,
    index: params.offset ?? 0
  }
  if (params.query) p.searchFilter = params.query
  if (params.loader && CF_LOADER[params.loader]) p.modLoaderType = CF_LOADER[params.loader]
  if (params.mcVersion) p.gameVersion = params.mcVersion

  const data = await cfGet('/mods/search', p)

  return (data.data ?? []).map((m: any): ModpackResult => {
    const indexes: any[] = m.latestFilesIndexes ?? []

    const loaderNums = [...new Set<number>(indexes.map((f) => f.modLoader).filter(Boolean))]
    const loaders = loaderNums.map((n) => CF_LOADER_NAME[n]).filter(Boolean) as string[]

    const mcVersions = [...new Set<string>(indexes.map((f) => f.gameVersion).filter(Boolean))]
      .sort()
      .reverse()

    return {
      id: String(m.id),
      name: m.name,
      description: m.summary ?? '',
      iconUrl: m.logo?.thumbnailUrl || m.logo?.url || undefined,
      downloads: m.downloadCount ?? 0,
      categories: (m.categories ?? []).map((c: any) => c.name as string),
      mcVersions,
      loaders,
      source: 'curseforge',
      externalUrl: m.links?.websiteUrl || undefined,
      author: m.authors?.[0]?.name || undefined
    }
  })
}
