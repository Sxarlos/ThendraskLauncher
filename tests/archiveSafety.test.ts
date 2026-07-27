import { describe, expect, it } from 'vitest'
import type AdmZip from 'adm-zip'
import { validateArchiveEntries } from '../src/main/archiveSafety'

function entry(name: string, size: number, compressedSize: number): AdmZip.IZipEntry {
  return {
    entryName: name,
    header: { size, compressedSize }
  } as AdmZip.IZipEntry
}

const TEST_LIMITS = {
  maxEntries: 3,
  maxExpandedBytes: 1_000,
  maxEntryBytes: 800,
  maxCompressionRatio: 20
}

describe('archive safety validation', () => {
  it('accepts an archive inside all limits', () => {
    expect(() => validateArchiveEntries(
      [entry('manifest.json', 100, 50), entry('overrides/config.txt', 200, 100)],
      'Test archive',
      TEST_LIMITS
    )).not.toThrow()
  })

  it('rejects excessive expanded size', () => {
    expect(() => validateArchiveEntries(
      [entry('one.bin', 600, 100), entry('two.bin', 500, 100)],
      'Test archive',
      TEST_LIMITS
    )).toThrow('too large')
  })

  it('rejects suspicious compression ratios', () => {
    expect(() => validateArchiveEntries(
      [entry('bomb.bin', 500, 10)],
      'Test archive',
      TEST_LIMITS
    )).toThrow('unsafe compression ratio')
  })
})
