import { createHash } from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

let gameDir = ''

vi.mock('../src/main/instances', () => ({
  getInstance: () => ({ id: 'instance', loader: 'fabric', mcVersion: '1.20.1', name: 'Custom Pack' }),
  instanceGameDir: () => gameDir
}))

vi.mock('../src/main/snapshots', () => ({
  createSnapshot: () => ({ id: 'snapshot' }),
  restoreSnapshot: vi.fn()
}))

vi.mock('../src/main/settings', () => ({
  getSettings: () => ({ relayUrl: 'https://relay.example' })
}))

import { installCompatibleMod, searchCompatibleMods } from '../src/main/customMods'

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('custom modpack management', () => {
  beforeEach(() => {
    gameDir = mkdtempSync(join(tmpdir(), 'thendrask-custom-mods-'))
    mkdirSync(join(gameDir, 'mods'), { recursive: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    const path = resolve(gameDir)
    if (path.startsWith(resolve(tmpdir())) && existsSync(path)) rmSync(path, { recursive: true, force: true })
  })

  it('filters Modrinth search to the instance version and loader', async () => {
    const fetchMock = vi.fn(async () => json({ hits: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await searchCompatibleMods('instance', 'sodium')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(JSON.parse(url.searchParams.get('facets') ?? '[]')).toEqual([
      ['project_type:mod'],
      ['versions:1.20.1'],
      ['categories:fabric'],
      ['client_side!=unsupported']
    ])
  })

  it('installs a mod and its required dependency with checksum verification', async () => {
    const rootBytes = Buffer.from('root-mod')
    const dependencyBytes = Buffer.from('dependency-mod')
    const sha1 = (value: Buffer): string => createHash('sha1').update(value).digest('hex')
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/project/root/version')) return json([{
        id: 'root-version', project_id: 'root', name: 'Root',
        files: [{ url: 'https://files/root.jar', filename: 'root.jar', primary: true, hashes: { sha1: sha1(rootBytes) } }],
        dependencies: [{ project_id: 'dependency', version_id: 'dep-version', dependency_type: 'required' }]
      }])
      if (url.includes('/version/dep-version')) return json({
        id: 'dep-version', project_id: 'dependency', name: 'Dependency',
        files: [{ url: 'https://files/dependency.jar', filename: 'dependency.jar', primary: true, hashes: { sha1: sha1(dependencyBytes) } }]
      })
      if (url.endsWith('/project/root')) return json({ title: 'Root Mod' })
      if (url.endsWith('/project/dependency')) return json({ title: 'Dependency Mod' })
      if (url === 'https://files/root.jar') return new Response(rootBytes)
      if (url === 'https://files/dependency.jar') return new Response(dependencyBytes)
      return new Response('missing', { status: 404 })
    }))

    const result = await installCompatibleMod('instance', 'root')

    expect(result.addedCount).toBe(2)
    expect(result.installed.map((mod) => mod.displayName).sort()).toEqual(['Dependency Mod', 'Root Mod'])
    expect(readdirSync(join(gameDir, 'mods')).sort()).toEqual(['dependency.jar', 'root.jar'])
  })

  it('rejects CurseForge installation without making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(installCompatibleMod('instance', '123', 'curseforge'))
      .rejects.toMatchObject({ code: 'CURSEFORGE_DISABLED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
