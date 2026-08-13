import { afterEach, describe, expect, it, vi } from 'vitest'
import { findCurseForgePackIdentity, getCurseForgeDownloadUrl } from '../src/main/modpack'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('disabled CurseForge implementation', () => {
  it('rejects download URL resolution before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurseForgeDownloadUrl(
      123,
      456,
      'https://edge.forgecdn.net/files/mod.jar'
    )).rejects.toMatchObject({ code: 'CURSEFORGE_DISABLED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects project enrichment before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(findCurseForgePackIdentity(
      'Example Pack',
      '1.0.0',
      'example.zip'
    )).rejects.toMatchObject({ code: 'CURSEFORGE_DISABLED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
