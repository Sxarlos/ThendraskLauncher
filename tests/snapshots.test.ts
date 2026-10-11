import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

let root = ''
let gameDir = ''
let instance: any
const updateInstance = vi.fn((_id, patch) => Object.assign(instance, patch))

vi.mock('../src/main/instances', () => ({
  getInstance: () => instance,
  updateInstance: (...args: any[]) => updateInstance(args[0], args[1]),
  instanceRootDir: () => root,
  instanceGameDir: () => gameDir
}))

import { createSnapshot, listSnapshots, restoreSnapshot } from '../src/main/snapshots'

describe('instance snapshots', () => {
  beforeEach(() => {
    instance = { mcVersion: '1.20.1', loader: 'fabric', loaderVersion: '0.15', source: 'modrinth', externalId: 'pack', packVersionId: 'old' }
    updateInstance.mockClear()
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
  it('restores installed metadata even when an update was already selected', () => {
    writeFileSync(join(gameDir, '.ender-pack.json'), JSON.stringify({ packVersionId: 'old', mcVersion: '1.20.1', loaderType: 'fabric', loaderVersion: '0.15' }))
    instance.packVersionId = 'new'
    const snapshot = createSnapshot('ignored-instance-id', 'pre-update')
    Object.assign(instance, { mcVersion: '1.21.1', loader: 'neoforge', loaderVersion: '21.1' })
    writeFileSync(join(gameDir, '.ender-pack.json'), JSON.stringify({ packVersionId: 'new' }))
    restoreSnapshot('ignored-instance-id', snapshot.id)
    expect(instance).toMatchObject({ packVersionId: 'old', mcVersion: '1.20.1', loader: 'fabric', loaderVersion: '0.15' })
    expect(JSON.parse(readFileSync(join(gameDir, '.ender-pack.json'), 'utf8')).packVersionId).toBe(instance.packVersionId)
  })

  it('recovers version metadata from legacy snapshots', () => {
    writeFileSync(join(gameDir, '.ender-pack.json'), JSON.stringify({ packVersionId: 'old', loaderType: 'fabric' }))
    const snapshot = createSnapshot('ignored-instance-id')
    rmSync(join(root, 'snapshots', snapshot.id, 'instance.json'))
    instance.packVersionId = 'new'
    restoreSnapshot('ignored-instance-id', snapshot.id)
    expect(instance.packVersionId).toBe('old')
  })

  it('removes install markers introduced after a snapshot', () => {
    const snapshot = createSnapshot('ignored-instance-id')
    writeFileSync(join(gameDir, '.ender-pack.json'), JSON.stringify({ packVersionId: 'new', loaderType: 'fabric' }))
    restoreSnapshot('ignored-instance-id', snapshot.id)
    expect(existsSync(join(gameDir, '.ender-pack.json'))).toBe(false)
  })

})
