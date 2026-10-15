import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, sep } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let gameDir = ''
vi.mock('../src/main/instances', () => ({
  getInstance: () => ({ id: 'instance', loader: 'vanilla', mcVersion: '1.20.1' }),
  instanceGameDir: () => gameDir
}))
import { importPackContent, installPackContent, listPackContent, removePackContent, searchPackContent, togglePackContent } from '../src/main/packContent'

const json = (data: unknown): Response => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })

describe('texture pack and shader content', () => {
  beforeEach(() => { gameDir = mkdtempSync(join(tmpdir(), 'thendrask-content-')) })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (resolve(gameDir).startsWith(resolve(tmpdir()) + sep)) rmSync(gameDir, { recursive: true, force: true })
  })

  it('searches textures on Vanilla without filtering by a mod loader', async () => {
    const request = vi.fn(async (_url: URL | string) => json({ hits: [] }))
    vi.stubGlobal('fetch', request)
    await searchPackContent('instance', 'resourcepack', '')
    const url = new URL(String(request.mock.calls[0][0]))
    expect(JSON.parse(url.searchParams.get('facets')!)).toEqual([['project_type:resourcepack'], ['versions:1.20.1']])
    expect(url.searchParams.get('index')).toBe('downloads')
  })

  it('filters shaders by the selected engine rather than the instance mod loader', async () => {
    const request = vi.fn(async (_url: URL | string) => json({ hits: [] }))
    vi.stubGlobal('fetch', request)
    await searchPackContent('instance', 'shader', 'lighting', 'optifine')
    const url = new URL(String(request.mock.calls[0][0]))
    expect(JSON.parse(url.searchParams.get('facets')!)).toEqual([['project_type:shader'], ['versions:1.20.1'], ['categories:optifine']])
  })

  it('keeps version compatibility when filtering texture categories and changing sort order', async () => {
    const request = vi.fn(async (_url: URL | string) => json({ hits: [] }))
    vi.stubGlobal('fetch', request)
    await searchPackContent('instance', 'resourcepack', '', 'iris', { category: '128x', sort: 'newest', offset: 30 })
    const url = new URL(String(request.mock.calls[0][0]))
    expect(JSON.parse(url.searchParams.get('facets')!)).toEqual([['project_type:resourcepack'], ['versions:1.20.1'], ['categories:128x']])
    expect(url.searchParams.get('index')).toBe('newest')
    expect(url.searchParams.get('offset')).toBe('30')
  })

  function mockDownload(options: { checksum?: string; filename?: string; projectType?: string } = {}): void {
    const bytes = Buffer.from('pack ZIP bytes')
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = String(input)
      if (url.includes('/version?')) {
        const params = new URL(url).searchParams
        expect(JSON.parse(params.get('game_versions')!)).toEqual(['1.20.1'])
        expect(JSON.parse(params.get('loaders')!)).toEqual(['iris'])
        return json([{ files: [{ primary: true, filename: options.filename ?? 'lighting.zip', url: 'https://cdn.modrinth.com/file.zip', hashes: { sha512: options.checksum ?? createHash('sha512').update(bytes).digest('hex') } }] }])
      }
      if (url.includes('/project/')) return json({ title: 'Lighting', project_type: options.projectType ?? 'shader' })
      return new Response(bytes)
    }))
  }

  it('verifies and installs shaders into shaderpacks, then includes, excludes, and removes them', async () => {
    mockDownload()
    const files = await installPackContent('instance', 'shader', 'lighting')
    expect(files[0]).toMatchObject({ name: 'lighting.zip', projectId: 'lighting', title: 'Lighting', enabled: true })
    expect(existsSync(join(gameDir, 'shaderpacks', 'lighting.zip'))).toBe(true)
    expect(existsSync(join(gameDir, 'mods', 'lighting.zip'))).toBe(false)
    expect(togglePackContent('instance', 'shader', 'lighting.zip')[0].enabled).toBe(false)
    expect(togglePackContent('instance', 'shader', 'lighting.zip.disabled')[0].enabled).toBe(true)
    expect(removePackContent('instance', 'shader', 'lighting.zip')).toEqual([])
  })

  it('rejects a bad checksum without leaving an installed file', async () => {
    mockDownload({ checksum: 'wrong' })
    await expect(installPackContent('instance', 'shader', 'lighting')).rejects.toThrow('checksum')
    expect(listPackContent('instance', 'shader')).toEqual([])
  })

  it('rejects unsafe filenames and projects of a different type', async () => {
    mockDownload({ filename: '../outside.zip' })
    await expect(installPackContent('instance', 'shader', 'lighting')).rejects.toThrow('filename')
    expect(existsSync(join(gameDir, 'outside.zip'))).toBe(false)
    mockDownload({ projectType: 'mod' })
    await expect(installPackContent('instance', 'shader', 'lighting')).rejects.toThrow('different content type')
    expect(() => removePackContent('instance', 'shader', '../outside.zip')).toThrow('filename')
  })

  it('imports local texture packs without overwriting existing or disabled files', () => {
    const source = join(gameDir, 'local.zip')
    writeFileSync(source, 'original')
    expect(importPackContent('instance', 'resourcepack', source)[0].name).toBe('local.zip')
    writeFileSync(source, 'replacement')
    expect(() => importPackContent('instance', 'resourcepack', source)).toThrow()
    expect(readFileSync(join(gameDir, 'resourcepacks', 'local.zip'), 'utf8')).toBe('original')
    togglePackContent('instance', 'resourcepack', 'local.zip')
    expect(() => importPackContent('instance', 'resourcepack', source)).toThrow('disabled')
  })
})
