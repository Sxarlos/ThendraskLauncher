import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

let root = ''
let gameDir = ''

vi.mock('../src/main/instances', () => ({
  instanceRootDir: () => root,
  instanceGameDir: () => gameDir
}))

import { createSnapshot, listSnapshots, restoreSnapshot } from '../src/main/snapshots'

describe('instance snapshots', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'thendrask-snapshot-test-'))
    gameDir = join(root, 'minecraft')
    mkdirSync(join(gameDir, 'mods'), { recursive: true })
    mkdirSync(join(gameDir, 'saves', 'world'), { recursive: true })
    writeFileSync(join(gameDir, 'mods', 'example.jar'), 'working-mod')
    writeFileSync(join(gameDir, 'saves', 'world', 'level.dat'), 'original-save')
  })

  afterEach(() => {
    const resolved = resolve(root)
    if (resolved.startsWith(resolve(tmpdir())) && existsSync(resolved)) {
      rmSync(resolved, { recursive: true, force: true })
    }
  })

  it('restores pack files without rolling back player saves', () => {
    const snapshot = createSnapshot('ignored-instance-id')
    writeFileSync(join(gameDir, 'mods', 'example.jar'), 'broken-mod')
    writeFileSync(join(gameDir, 'saves', 'world', 'level.dat'), 'newer-save')

    restoreSnapshot('ignored-instance-id', snapshot.id)

    expect(readFileSync(join(gameDir, 'mods', 'example.jar'), 'utf-8')).toBe('working-mod')
    expect(readFileSync(join(gameDir, 'saves', 'world', 'level.dat'), 'utf-8')).toBe('newer-save')
    expect(listSnapshots('ignored-instance-id')).toHaveLength(1)
  })
})
