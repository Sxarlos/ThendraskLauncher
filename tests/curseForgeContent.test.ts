import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, sep } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let gameDir = ''
vi.mock('../src/shared/features', () => ({ CURSEFORGE_ENABLED: true }))
vi.mock('../src/main/settings', () => ({ getSettings: () => ({ relayUrl: 'https://relay.example' }) }))
vi.mock('../src/main/instances', () => ({
  getInstance: () => ({ id: 'instance', loader: 'fabric', mcVersion: '1.20.1' }),
  instanceGameDir: () => gameDir
}))
vi.mock('../src/main/snapshots', () => ({ createSnapshot: () => ({ id: 'snapshot' }), restoreSnapshot: vi.fn() }))

import { fetchContentCategories } from '../src/main/contentDiscovery'
import { installPackContent, searchPackContent } from '../src/main/packContent'
import { searchCompatibleMods } from '../src/main/customMods'

const json = (data: unknown): Response => new Response(JSON.stringify(data))
describe('CurseForge content with the release provider enabled', () => {
  beforeEach(() => { gameDir = mkdtempSync(join(tmpdir(), 'thendrask-cf-content-')) })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (resolve(gameDir).startsWith(resolve(tmpdir()) + sep)) rmSync(gameDir, { recursive: true, force: true })
  })

  it('fetches actual provider category names for mods and textures through the relay', async () => {
    const request = vi.fn(async (input: URL | string) => {
      const url = new URL(String(input))
      expect(url.origin).toBe('https://relay.example')
      expect(url.pathname).toBe('/curseforge/v1/categories')
      const classId = Number(url.searchParams.get('classId'))
      return json({ data: [{ id: classId, name: 'Root', isClass: true }, { id: 123, name: classId === 6 ? 'Technology' : 'Photo Realistic', classId }] })
    })
    vi.stubGlobal('fetch', request)
    expect(await fetchContentCategories('mod', 'curseforge')).toEqual([{ id: '123', name: 'Technology', group: 'Categories' }])
    expect(await fetchContentCategories('resourcepack', 'curseforge')).toEqual([{ id: '123', name: 'Photo Realistic', group: 'Categories' }])
    await fetchContentCategories('mod', 'curseforge')
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('combines mod category and sorting with loader and version filters', async () => {
    const request = vi.fn(async (_input: string | URL) => json({ data: [] }))
    vi.stubGlobal('fetch', request)
    await searchCompatibleMods('instance', 'pipes', 'curseforge', { category: '412', sort: 'updated' })
    const url = new URL(String(request.mock.calls[0][0]))
    expect(url.searchParams.get('categoryId')).toBe('412')
    expect(url.searchParams.get('sortField')).toBe('3')
    expect(url.searchParams.get('modLoaderType')).toBe('4')
    expect(url.searchParams.get('gameVersion')).toBe('1.20.1')
  })

  it('searches texture packs using their class and category without a mod-loader filter', async () => {
    const request = vi.fn(async (_input: string | URL) => json({ data: [{ id: 10, name: 'Textures', summary: 'Description', downloadCount: 100, links: { websiteUrl: 'https://www.curseforge.com/minecraft/texture-packs/example' } }] }))
    vi.stubGlobal('fetch', request)
    const results = await searchPackContent('instance', 'resourcepack', 'realistic', 'iris', { category: '400', sort: 'newest' }, 'curseforge')
    const url = new URL(String(request.mock.calls[0][0]))
    expect(url.searchParams.get('classId')).toBe('12')
    expect(url.searchParams.get('categoryId')).toBe('400')
    expect(url.searchParams.get('sortField')).toBe('11')
    expect(url.searchParams.has('modLoaderType')).toBe(false)
    expect(results[0]).toMatchObject({ source: 'curseforge', projectId: '10', externalUrl: 'https://www.curseforge.com/minecraft/texture-packs/example' })
  })

  function mockInstall(options: { checksum?: string; distribution?: boolean; downloadUrl?: string | null } = {}): void {
    const bytes = Buffer.from('verified ZIP')
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = String(input)
      if (url.endsWith('/mods/10')) return json({ data: { name: 'Textures', classId: 12, gameId: 432, allowModDistribution: options.distribution } })
      if (url.includes('/mods/10/files?')) return json({ data: [
        { id: 20, fileName: 'wrong-version.zip', fileDate: '2026-10-11', gameVersions: ['1.21.1'], hashes: [] },
        { id: 21, fileName: 'textures.zip', fileDate: '2026-10-10', gameVersions: ['1.20.1'], downloadUrl: options.downloadUrl === null ? undefined : 'https://files.example/textures.zip', hashes: [{ algo: 1, value: options.checksum ?? createHash('sha1').update(bytes).digest('hex') }] }
      ] })
      if (url.endsWith('/download-url')) return new Response('', { status: 403 })
      if (url === 'https://files.example/textures.zip') return new Response(bytes)
      return new Response('', { status: 404 })
    }))
  }

  it('installs a compatible ZIP into resourcepacks and records its provider', async () => {
    mockInstall()
    const files = await installPackContent('instance', 'resourcepack', '10', 'iris', 'curseforge')
    expect(files[0]).toMatchObject({ name: 'textures.zip', source: 'curseforge', projectId: '10', title: 'Textures' })
    expect(readFileSync(join(gameDir, 'resourcepacks', 'textures.zip'), 'utf8')).toBe('verified ZIP')
    expect(existsSync(join(gameDir, 'resourcepacks', 'wrong-version.zip'))).toBe(false)
  })

  it('rejects mismatched checksums before installing', async () => {
    mockInstall({ checksum: 'wrong' })
    await expect(installPackContent('instance', 'resourcepack', '10', 'iris', 'curseforge')).rejects.toThrow('checksum')
    expect(existsSync(join(gameDir, 'resourcepacks', 'textures.zip'))).toBe(false)
  })

  it('explains how to import a ZIP when distribution or downloads are unavailable', async () => {
    mockInstall({ distribution: false })
    await expect(installPackContent('instance', 'resourcepack', '10', 'iris', 'curseforge')).rejects.toThrow('Add local ZIP')
    mockInstall({ downloadUrl: null })
    await expect(installPackContent('instance', 'resourcepack', '10', 'iris', 'curseforge')).rejects.toThrow('Add local ZIP')
  })
})
