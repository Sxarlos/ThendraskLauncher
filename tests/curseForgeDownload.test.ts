import { afterEach, describe, expect, it, vi } from 'vitest'
import { findCurseForgePackIdentity, getCurseForgeDownloadUrl } from '../src/main/modpack'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CurseForge download URL resolution', () => {
  it('uses the URL already returned in file metadata', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurseForgeDownloadUrl(
      'api-key',
      123,
      456,
      'https://files.example/mod.jar'
    )).resolves.toBe('https://files.example/mod.jar')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the dedicated CurseForge download-url endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: 'https://files.example/restricted.jar' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurseForgeDownloadUrl('api-key', 123, 456, null))
      .resolves.toBe('https://files.example/restricted.jar')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.curseforge.com/v1/mods/123/files/456/download-url',
      { headers: { 'x-api-key': 'api-key', Accept: 'application/json' } }
    )
  })

  it('reports a file as unavailable when CurseForge rejects that endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    await expect(getCurseForgeDownloadUrl('api-key', 123, 456, null)).resolves.toBeNull()
  })
})

describe('CurseForge imported pack identity', () => {
  it('requires one project match and verifies the exact exported file', async () => {
    const project = {
      id: 1408845,
      name: 'Path of the Ascended',
      logo: { thumbnailUrl: 'https://media.forgecdn.net/icon.png' },
      screenshots: [{ url: 'https://media.forgecdn.net/screenshot.png' }]
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [project] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{
          id: 8392384,
          displayName: 'Path of the Ascended: Perfected - 1.1.11',
          fileName: 'Path of the Ascended- Perfected-1.1.11.zip'
        }]
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(findCurseForgePackIdentity(
      'api-key',
      'Path of the Ascended: Perfected',
      '1.1.11',
      'Path of the Ascended- Perfected-1.1.11.zip'
    )).resolves.toEqual({
      externalId: '1408845',
      packVersionId: '8392384',
      iconUrl: 'https://media.forgecdn.net/icon.png',
      screenshotUrls: ['https://media.forgecdn.net/screenshot.png']
    })
  })

  it('does not guess when multiple CurseForge projects match', async () => {
    const projects = [
      { id: 1, name: 'Example Pack' },
      { id: 2, name: 'Example Pack Extended' }
    ]
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: projects }), { status: 200 })))

    await expect(findCurseForgePackIdentity('api-key', 'Example Pack Extended'))
      .resolves.toBeNull()
  })
})
