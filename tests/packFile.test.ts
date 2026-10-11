import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensurePackFile } from '../src/main/packFile'

let root: string
let file: string
const hashes = { sha512: createHash('sha512').update('new resource').digest('hex') }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'thendrask-pack-file-'))
  file = join(root, 'resource.zip')
  writeFileSync(file, 'old resource')
})
afterEach(() => { vi.unstubAllGlobals(); rmSync(root, { recursive: true, force: true }) })

describe('pack resource updates', () => {
  it('replaces an existing outdated resource and skips a subsequent verified cache hit', async () => {
    const fetchMock = vi.fn(async () => new Response('new resource'))
    vi.stubGlobal('fetch', fetchMock)
    await ensurePackFile(file, ['https://example.com/file'], hashes)
    expect(readFileSync(file, 'utf8')).toBe('new resource')
    await ensurePackFile(file, ['https://example.com/file'], hashes)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('tries another mirror after a checksum failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('corrupt')).mockResolvedValueOnce(new Response('new resource')))
    await ensurePackFile(file, ['https://example.com/a', 'https://example.com/b'], hashes)
    expect(readFileSync(file, 'utf8')).toBe('new resource')
  })
  it('keeps the original resource when every mirror fails verification', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('corrupt')))
    await expect(ensurePackFile(file, ['https://example.com/a'], hashes)).rejects.toThrow(/verified/)
    expect(readFileSync(file, 'utf8')).toBe('old resource')
    expect(readdirSync(root)).toEqual(['resource.zip'])
  })
})
