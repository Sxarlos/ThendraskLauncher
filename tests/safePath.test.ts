import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import { isValidInstanceId, safeJoin } from '../src/main/safePath'

const base = resolve('game-dir')

describe('safeJoin', () => {
  it('joins ordinary relative paths under the base dir', () => {
    expect(safeJoin(base, 'mods/foo.jar')).toBe(resolve(base, 'mods', 'foo.jar'))
    expect(safeJoin(base, 'config/deep/nested.toml')).toBe(
      resolve(base, 'config', 'deep', 'nested.toml')
    )
  })

  it('allows .. segments that stay inside the base dir', () => {
    expect(safeJoin(base, 'a/../b.txt')).toBe(resolve(base, 'b.txt'))
  })

  it('rejects traversal out of the base dir', () => {
    expect(safeJoin(base, '../evil.txt')).toBeNull()
    expect(safeJoin(base, 'mods/../../evil.txt')).toBeNull()
    expect(safeJoin(base, '../../../../etc/passwd')).toBeNull()
  })

  it('rejects absolute paths', () => {
    expect(safeJoin(base, '/etc/passwd')).toBeNull()
  })

  it('rejects the base dir itself', () => {
    expect(safeJoin(base, '')).toBeNull()
    expect(safeJoin(base, '.')).toBeNull()
  })

  it.runIf(process.platform === 'win32')('rejects Windows-style escapes', () => {
    expect(safeJoin(base, '..\\evil.txt')).toBeNull()
    expect(safeJoin(base, 'C:\\Windows\\System32\\evil.dll')).toBeNull()
  })
})

describe('isValidInstanceId', () => {
  it('accepts UUID v4 IDs generated for instances', () => {
    expect(isValidInstanceId('2f68b8a7-7a7c-4fd2-8f28-6bcc69d7f82a')).toBe(true)
  })

  it('rejects traversal, arbitrary strings, and other UUID versions', () => {
    expect(isValidInstanceId('../outside')).toBe(false)
    expect(isValidInstanceId('not-an-id')).toBe(false)
    expect(isValidInstanceId('2f68b8a7-7a7c-1fd2-8f28-6bcc69d7f82a')).toBe(false)
  })
})
