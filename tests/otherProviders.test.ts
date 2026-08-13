import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  searchAtlauncher,
  searchFtb,
  searchFtbLegacy,
  searchModrinth,
  searchTechnic
} from '../src/main/browse'

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('enabled modpack providers', () => {
  it('keeps Modrinth browsing operational', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      hits: [{
        project_id: 'mr-pack',
        slug: 'mr-pack',
        title: 'Modrinth Pack',
        categories: ['fabric'],
        versions: ['1.20.1']
      }]
    })))

    const results = await searchModrinth({})
    expect(results).toMatchObject([{ id: 'mr-pack', source: 'modrinth' }])
  })

  it.each([
    ['ftb', searchFtb],
    ['ftb-legacy', (params: {}) => searchFtbLegacy(params, 'all')]
  ] as const)('keeps %s browsing operational', async (source, search) => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('/popular/installs/')) return json({ packs: [42] })
      return json({
        id: 42,
        name: 'FTB Pack',
        synopsis: 'Pack',
        installs: 10,
        authors: [{ name: 'Community Author' }],
        versions: [],
        tags: []
      })
    }))

    const results = await search({})
    expect(results).toMatchObject([{ id: '42', source }])
  })

  it('blocks ATLauncher browsing in public builds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([{
      id: 7,
      name: 'ATL Pack',
      description: 'Pack',
      type: 'public',
      versions: [{ version: '1.0', minecraft: '1.20.1' }]
    }])))

    await expect(searchAtlauncher({}, 'public')).rejects.toMatchObject({
      code: 'RESTRICTED_CATALOG_DISABLED'
    })
  })

  it('blocks Technic browsing in public builds', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('/trending?')) return json({ modpacks: [{ slug: 'technic-pack' }] })
      return json({ name: 'technic-pack', displayName: 'Technic Pack' })
    }))

    await expect(searchTechnic({})).rejects.toMatchObject({
      code: 'RESTRICTED_CATALOG_DISABLED'
    })
  })
})
