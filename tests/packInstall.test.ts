import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

let root = ''
vi.mock('../src/main/instances', () => ({ instanceGameDir: () => root }))
import { installMrpack } from '../src/main/modpack'
import { searchModrinth } from '../src/main/browse'

afterEach(() => {
  vi.unstubAllGlobals()
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
})

describe('Modrinth install integration', () => {
  it('updates an existing resource and records the archive game version', async () => {
    root = mkdtempSync(join(tmpdir(), 'thendrask-pack-install-'))
    mkdirSync(join(root, 'resourcepacks'))
    const file = join(root, 'resourcepacks', 'pack.zip')
    writeFileSync(file, 'old resource')
    const zip = new AdmZip()
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify({
      dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
      files: [{ path: 'resourcepacks/pack.zip', downloads: ['https://example.com/resource'], hashes: { sha512: createHash('sha512').update('new resource').digest('hex') } }]
    })))
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'release', files: [{ primary: true, url: 'https://example.com/pack' }] }))
      .mockResolvedValueOnce(new Response(zip.toBuffer()))
      .mockResolvedValueOnce(new Response('new resource')))
    await expect(installMrpack('instance', 'project', 'release', () => {})).resolves.toMatchObject({
      mcVersion: '1.21.1', packVersionId: 'release', loaderType: 'fabric', loaderVersion: '0.16.5'
    })
    expect(readFileSync(file, 'utf8')).toBe('new resource')
    expect(JSON.parse(readFileSync(join(root, '.ender-pack.json'), 'utf8')).mcVersion).toBe('1.21.1')
  })

  it('sorts release numbers numerically in browse results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ hits: [{ versions: ['1.9', '1.21.1', '1.10'], categories: ['fabric'] }] })))
    const results = await searchModrinth({ query: '' })
    expect(results[0].mcVersions).toEqual(['1.21.1', '1.10', '1.9'])
  })
})
