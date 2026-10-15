import { afterEach, describe, expect, it, vi } from 'vitest'
import { curseForgeSort, fetchContentCategories, modrinthSort, validateContentSearch } from '../src/main/contentDiscovery'

const json = (data: unknown): Response => new Response(JSON.stringify(data))
afterEach(() => { vi.unstubAllGlobals() })

describe('provider content discovery', () => {
  it('accepts page offsets and rejects invalid or excessive offsets', () => {
    expect(validateContentSearch({ offset: 30 })).toEqual({ offset: 30 })
    for (const offset of [-1, 0.5, NaN, Infinity, 10001, '30']) {
      expect(() => validateContentSearch({ offset: offset as number })).toThrow('offset')
    }
  })
  it('uses Modrinth categories for the selected content type and preserves their groups', async () => {
    const request = vi.fn(async () => json([
      { name: 'technology', project_type: 'mod', header: 'categories' },
      { name: 'fabric', project_type: 'mod', header: 'loaders' },
      { name: 'realistic', project_type: 'resourcepack', header: 'categories' },
      { name: '128x', project_type: 'resourcepack', header: 'resolutions' }
    ]))
    vi.stubGlobal('fetch', request)
    expect(await fetchContentCategories('mod')).toEqual([{ id: 'technology', name: 'Technology', group: 'Categories' }])
    expect(await fetchContentCategories('resourcepack')).toEqual([
      { id: 'realistic', name: 'Realistic', group: 'Categories' },
      { id: '128x', name: '128x', group: 'Resolutions' }
    ])
    await fetchContentCategories('resourcepack')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not cache category request failures, so retry can recover', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(json([]))
    vi.stubGlobal('fetch', request)
    await expect(fetchContentCategories('shader')).rejects.toThrow('503')
    expect(await fetchContentCategories('shader')).toEqual([])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('maps each provider’s sort choices to its own API values', () => {
    expect(modrinthSort('', {})).toBe('downloads')
    expect(modrinthSort('sodium', {})).toBe('relevance')
    expect(modrinthSort('', { sort: 'follows' })).toBe('follows')
    expect(curseForgeSort({ sort: 'updated' })).toBe('3')
    expect(curseForgeSort({ sort: 'newest' })).toBe('11')
    expect(curseForgeSort({ sort: 'downloads' })).toBe('6')
    expect(() => curseForgeSort({ sort: 'follows' })).toThrow('does not support')
  })

  it('rejects filters that could inject a different search facet', () => {
    expect(() => validateContentSearch({ category: 'technology],[project_type:modpack' })).toThrow('category')
    expect(() => validateContentSearch({ sort: 'unknown' as 'downloads' })).toThrow('sort')
  })
})
