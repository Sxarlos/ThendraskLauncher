import type { ContentCategory, ContentKind, ContentSearchOptions } from '@shared/types'
import { assertCurseForgeSourceAllowed } from './curseforgePolicy'
import { curseForgeFetch } from './curseforgeApi'

type Source = 'modrinth' | 'curseforge'
const cache = new Map<string, { expires: number; categories: ContentCategory[] }>()
const label = (value: string): string => value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export function validateContentSearch(options: ContentSearchOptions = {}): ContentSearchOptions {
  if (!options || typeof options !== 'object') throw new Error('Invalid content filters.')
  if (options.offset !== undefined && (!Number.isSafeInteger(options.offset) || options.offset < 0 || options.offset > 10000)) throw new Error('Invalid search offset.')
  if (options.category !== undefined && (typeof options.category !== 'string' || !/^[a-zA-Z0-9_-]{0,80}$/.test(options.category))) throw new Error('Invalid category.')
  if (options.sort !== undefined && !['relevance', 'downloads', 'updated', 'newest', 'follows'].includes(options.sort)) throw new Error('Invalid sort order.')
  return options
}

export function modrinthSort(query: string, options: ContentSearchOptions): string {
  validateContentSearch(options)
  return options.sort && options.sort !== 'relevance' ? options.sort : query.trim() ? 'relevance' : 'downloads'
}

export function curseForgeSort(options: ContentSearchOptions): string {
  validateContentSearch(options)
  if (options.sort === 'follows') throw new Error('CurseForge does not support sorting by follows.')
  return options.sort === 'downloads' ? '6' : options.sort === 'updated' ? '3' : options.sort === 'newest' ? '11' : '2'
}

export async function fetchContentCategories(kind: ContentKind | 'mod', source: Source = 'modrinth'): Promise<ContentCategory[]> {
  assertCurseForgeSourceAllowed(source)
  if (!['mod', 'resourcepack', 'shader'].includes(kind)) throw new Error('Invalid content type.')
  const key = `${source}:${kind}`
  // Only Modrinth categories are cached. CurseForge's public API terms
  // prohibit caching its API responses.
  const cached = source === 'modrinth' ? cache.get(key) : undefined
  if (cached && cached.expires > Date.now()) return cached.categories
  let categories: ContentCategory[]
  if (source === 'curseforge') {
    const classId = kind === 'mod' ? 6 : kind === 'resourcepack' ? 12 : 6552
    const response = await curseForgeFetch(`/v1/categories?gameId=432&classId=${classId}`)
    if (response.status === 404) throw new Error('The CurseForge relay needs updating to support categories.')
    if (!response.ok) throw new Error(`Could not load CurseForge categories: HTTP ${response.status}`)
    const data = await response.json() as { data: Array<{ id: number; name: string; classId?: number; isClass?: boolean }> }
    categories = data.data.filter((entry) => !entry.isClass && (entry.classId === undefined || entry.classId === classId))
      .map((entry) => ({ id: String(entry.id), name: entry.name, group: 'Categories' }))
  } else {
    const response = await fetch('https://api.modrinth.com/v2/tag/category', { headers: { 'User-Agent': 'thendrask-launcher (github.com/Sxarlos/ThendraskLauncher)' } })
    if (!response.ok) throw new Error(`Could not load Modrinth categories: HTTP ${response.status}`)
    const data = await response.json() as Array<{ name: string; project_type: string; header: string }>
    categories = data.filter((entry) => entry.project_type === kind && entry.header !== 'loaders')
      .map((entry) => ({ id: entry.name, name: label(entry.name), group: label(entry.header || 'categories') }))
  }
  categories.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
  if (source === 'modrinth') cache.set(key, { categories, expires: Date.now() + 10 * 60 * 1000 })
  return categories
}
