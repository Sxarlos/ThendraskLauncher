import { createHash } from 'crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  curseForgeInstallDirectory,
  findCurseForgePackIdentity,
  getCurseForgeDownloadUrl,
  verifyCurseForgeManualFile
} from '../src/main/modpack'

const tempDirs: string[] = []

afterEach(() => {
  vi.unstubAllGlobals()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('manual CurseForge file verification', () => {
  it('accepts a file matching CurseForge SHA-1 metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thendrask-cf-'))
    tempDirs.push(dir)
    const path = join(dir, 'required.zip')
    const contents = Buffer.from('expected CurseForge file')
    writeFileSync(path, contents)

    expect(() => verifyCurseForgeManualFile(path, {
      displayName: 'Required file',
      fileName: 'required.zip',
      hashes: { sha1: createHash('sha1').update(contents).digest('hex') }
    })).not.toThrow()
  })

  it('rejects a file whose checksum does not match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thendrask-cf-'))
    tempDirs.push(dir)
    const path = join(dir, 'required.jar')
    writeFileSync(path, 'wrong file')

    expect(() => verifyCurseForgeManualFile(path, {
      displayName: 'Required file',
      fileName: 'required.jar',
      hashes: { sha1: createHash('sha1').update('right file').digest('hex') }
    })).toThrow(/did not match CurseForge's SHA1 checksum/)
  })

  it('uses CurseForge MD5 metadata when SHA-1 is unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thendrask-cf-'))
    tempDirs.push(dir)
    const path = join(dir, 'legacy.jar')
    const contents = Buffer.from('legacy CurseForge file')
    writeFileSync(path, contents)

    expect(() => verifyCurseForgeManualFile(path, {
      displayName: 'Legacy file',
      hashes: { md5: createHash('md5').update(contents).digest('hex') }
    })).not.toThrow()
  })
})

describe('CurseForge project installation directories', () => {
  it.each([
    [6, 'mods'],
    [12, 'resourcepacks'],
    [6552, 'shaderpacks'],
    [6945, 'config/paxi/datapacks'],
    [undefined, 'mods'],
    [999999, 'mods']
  ] as const)('maps class %s to %s', (classId, expected) => {
    expect(curseForgeInstallDirectory(classId)).toBe(expected)
  })
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
