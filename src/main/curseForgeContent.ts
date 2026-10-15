import type { ContentKind, ContentSearchOptions, ModSearchResult } from '@shared/types'
import { curseForgeSort, validateContentSearch } from './contentDiscovery'
import { curseForgeFetch } from './curseforgeApi'

export const CURSEFORGE_CONTENT_CLASSES = { mod: 6, resourcepack: 12, shader: 6552 } as const

async function cfJson<T>(url: URL | string): Promise<T> {
  const response = await curseForgeFetch(url)
  if (!response.ok) throw new Error(`CurseForge returned HTTP ${response.status}`)
  return response.json() as Promise<T>
}

export async function searchCurseForgeContent(kind: ContentKind, mcVersion: string, query: string, options: ContentSearchOptions): Promise<ModSearchResult[]> {
  validateContentSearch(options)
  const url = new URL('https://api.curseforge.com/v1/mods/search')
  url.searchParams.set('gameId', '432')
  url.searchParams.set('classId', String(CURSEFORGE_CONTENT_CLASSES[kind]))
  url.searchParams.set('gameVersion', mcVersion)
  url.searchParams.set('searchFilter', query.trim())
  url.searchParams.set('sortField', curseForgeSort(options))
  url.searchParams.set('sortOrder', 'desc')
  url.searchParams.set('pageSize', '30')
  url.searchParams.set('index', String(options.offset ?? 0))
  if (options.category) {
    if (!/^\d+$/.test(options.category)) throw new Error('Invalid CurseForge category.')
    url.searchParams.set('categoryId', options.category)
  }
  const result = await cfJson<{ data: Array<{ id: number; name: string; summary: string; logo?: { thumbnailUrl: string }; downloadCount: number; links?: { websiteUrl?: string } }> }>(url)
  return result.data.map((project) => ({
    source: 'curseforge', projectId: String(project.id), title: project.name, description: project.summary,
    iconUrl: project.logo?.thumbnailUrl, downloads: project.downloadCount, externalUrl: project.links?.websiteUrl
  }))
}

export async function resolveCurseForgePack(kind: ContentKind, mcVersion: string, projectId: string): Promise<{
  title: string
  filename: string
  url: string
  hashes: { sha1?: string; md5?: string }
}> {
  if (!/^\d+$/.test(projectId)) throw new Error('Invalid CurseForge project ID.')
  const { data: project } = await cfJson<{ data: { name: string; classId: number; gameId: number; allowModDistribution?: boolean } }>(`/v1/mods/${projectId}`)
  if (project.gameId !== 432 || project.classId !== CURSEFORGE_CONTENT_CLASSES[kind]) throw new Error('This project is a different content type.')
  const manualMessage = 'This pack is unavailable for third-party downloads. Download its ZIP from CurseForge and use Add local ZIP.'
  if (project.allowModDistribution === false) throw new Error(manualMessage)
  const url = new URL(`https://api.curseforge.com/v1/mods/${projectId}/files`)
  url.searchParams.set('gameVersion', mcVersion)
  url.searchParams.set('pageSize', '50')
  const { data: files } = await cfJson<{ data: Array<{
    id: number; fileName: string; fileDate: string; downloadUrl?: string; gameVersions: string[];
    isAvailable?: boolean; isServerPack?: boolean; exposeAsAlternative?: boolean; hashes: Array<{ algo: number; value: string }>
  }> }>(url)
  const file = files.filter((file) => file.isAvailable !== false && !file.isServerPack && !file.exposeAsAlternative && file.gameVersions.includes(mcVersion) && /\.zip$/i.test(file.fileName))
    .sort((a, b) => b.fileDate.localeCompare(a.fileDate))[0]
  if (!file) throw new Error('No compatible CurseForge ZIP is available for this Minecraft version.')
  let downloadUrl = file.downloadUrl
  if (!downloadUrl) {
    try { downloadUrl = (await cfJson<{ data: string }>(`/v1/mods/${projectId}/files/${file.id}/download-url`)).data } catch { throw new Error(manualMessage) }
  }
  if (!downloadUrl) throw new Error(manualMessage)
  return {
    title: project.name, filename: file.fileName, url: downloadUrl,
    hashes: { sha1: file.hashes.find((hash) => hash.algo === 1)?.value, md5: file.hashes.find((hash) => hash.algo === 2)?.value }
  }
}
