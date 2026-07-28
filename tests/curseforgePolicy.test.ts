import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertCurseForgeIpcAllowed,
  installMainFetchGuard,
  installSessionRequestGuard,
  isCurseForgeHost
} from '../src/main/curseforgePolicy'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CurseForge disabled policy', () => {
  it.each([
    ['browse:curseforge', [{}]],
    ['customMods:search', ['instance', 'query', 'curseforge']],
    ['customMods:install', ['instance', '123', 'curseforge']],
    ['customMods:toggle', ['instance', 'curseforge', '123', true]],
    ['customMods:remove', ['instance', 'curseforge', '123']],
    ['instances:create', [{ source: 'curseforge' }]],
    ['settings:set', [{ curseforgeApiKey: 'obviously-fake-key' }]],
    ['instance:importMissingCurseForgeMod', ['instance', 1, 2]],
    ['modpack:missingCurseForgeFiles', ['instance']],
    ['modpack:enrichCurseForgeImport', ['instance']],
    ['shell:openExternal', ['https://www.curseforge.com/minecraft/modpacks/example']],
    ['update:openDownload', ['https://edge.forgecdn.net/files/example.jar']]
  ])('returns CURSEFORGE_DISABLED for IPC operation %s', (channel, args) => {
    expect(() => assertCurseForgeIpcAllowed(channel, args))
      .toThrowError(expect.objectContaining({ code: 'CURSEFORGE_DISABLED' }))
  })

  it('recognizes CurseForge and ForgeCDN hosts without blocking ordinary Forge infrastructure', () => {
    expect(isCurseForgeHost('api.curseforge.com')).toBe(true)
    expect(isCurseForgeHost('edge.forgecdn.net')).toBe(true)
    expect(isCurseForgeHost('media.forgecdn.net')).toBe(true)
    expect(isCurseForgeHost('files.minecraftforge.net')).toBe(false)
    expect(isCurseForgeHost('api.modrinth.com')).toBe(false)
  })

  it('prevents main-process fetch from reaching blocked hosts', async () => {
    const transport = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', transport)
    installMainFetchGuard()

    await expect(fetch('https://api.curseforge.com/v1/mods/search'))
      .rejects.toMatchObject({ code: 'CURSEFORGE_DISABLED' })
    await expect(fetch('https://edge.forgecdn.net/files/example.jar'))
      .rejects.toMatchObject({ code: 'CURSEFORGE_DISABLED' })
    expect(transport).not.toHaveBeenCalled()

    await expect(fetch('https://api.modrinth.com/v2/search')).resolves.toBeInstanceOf(Response)
    expect(transport).toHaveBeenCalledOnce()
  })

  it('checks redirect destinations before following them', async () => {
    const transport = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url === 'https://api.modrinth.com/v2/search') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://media.forgecdn.net/redirected.jar' }
        })
      }
      return new Response('unexpected')
    })
    vi.stubGlobal('fetch', transport)
    installMainFetchGuard()

    await expect(fetch('https://api.modrinth.com/v2/search'))
      .rejects.toMatchObject({ code: 'CURSEFORGE_DISABLED' })
    expect(transport).toHaveBeenCalledOnce()
  })

  it('continues to follow redirects between allowed providers', async () => {
    const transport = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url === 'https://api.modrinth.com/v2/search') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.modrinth.com/result.json' }
        })
      }
      return new Response('ok')
    })
    vi.stubGlobal('fetch', transport)
    installMainFetchGuard()

    await expect(fetch('https://api.modrinth.com/v2/search')).resolves.toBeInstanceOf(Response)
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('cancels Electron session requests to blocked hosts only', () => {
    let listener: ((details: { url: string }, callback: (value: { cancel: boolean }) => void) => void) | undefined
    installSessionRequestGuard({
      onBeforeRequest: (_filter, next) => { listener = next }
    })
    const callback = vi.fn()
    listener?.({ url: 'https://media.forgecdn.net/icon.png' }, callback)
    expect(callback).toHaveBeenLastCalledWith({ cancel: true })
    listener?.({ url: 'https://api.modrinth.com/v2/search' }, callback)
    expect(callback).toHaveBeenLastCalledWith({ cancel: false })
  })
})
