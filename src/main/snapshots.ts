import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { instanceGameDir, instanceRootDir } from './instances'
import type { InstanceSnapshot } from '@shared/types'

const EXCLUDED = new Set(['assets', 'libraries', 'versions', 'logs', 'crash-reports', 'screenshots', 'saves', 'natives'])
const PACK_MANAGED = new Set(['mods', 'config', 'defaultconfigs', 'kubejs', 'scripts', 'resourcepacks', 'shaderpacks'])

function snapshotsDir(instanceId: string): string {
  const dir = join(instanceRootDir(instanceId), 'snapshots')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function directorySize(path: string): number {
  if (!existsSync(path)) return 0
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) return 0
  if (!stat.isDirectory()) return stat.size
  return readdirSync(path).reduce((total, name) => total + directorySize(join(path, name)), 0)
}

function readSnapshot(path: string): InstanceSnapshot | null {
  try {
    return JSON.parse(readFileSync(join(path, 'snapshot.json'), 'utf-8')) as InstanceSnapshot
  } catch {
    return null
  }
}

export function listSnapshots(instanceId: string): InstanceSnapshot[] {
  const dir = snapshotsDir(instanceId)
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const snapshot = readSnapshot(join(dir, entry.name))
      return snapshot ? [snapshot] : []
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function createSnapshot(
  instanceId: string,
  reason: InstanceSnapshot['reason'] = 'manual',
  label = reason === 'manual' ? 'Manual snapshot' : 'Before modpack update'
): InstanceSnapshot {
  const id = randomUUID()
  const root = join(snapshotsDir(instanceId), id)
  const payload = join(root, 'minecraft')
  const gameDir = instanceGameDir(instanceId)
  mkdirSync(payload, { recursive: true })
  for (const entry of readdirSync(gameDir, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name) || entry.isSymbolicLink()) continue
    cpSync(join(gameDir, entry.name), join(payload, entry.name), { recursive: true, force: true })
  }
  const snapshot: InstanceSnapshot = {
    id,
    instanceId,
    createdAt: Date.now(),
    reason,
    label,
    sizeBytes: directorySize(payload)
  }
  writeFileSync(join(root, 'snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf-8')
  trimSnapshots(instanceId)
  return snapshot
}

export function restoreSnapshot(instanceId: string, snapshotId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(snapshotId)) throw new Error('Invalid snapshot ID.')
  const root = join(snapshotsDir(instanceId), snapshotId)
  const snapshot = readSnapshot(root)
  if (!snapshot || snapshot.instanceId !== instanceId) throw new Error('Snapshot not found.')
  const payload = join(root, 'minecraft')
  const gameDir = instanceGameDir(instanceId)
  for (const name of PACK_MANAGED) rmSync(join(gameDir, name), { recursive: true, force: true })
  for (const entry of readdirSync(payload, { withFileTypes: true })) {
    const destination = join(gameDir, entry.name)
    rmSync(destination, { recursive: true, force: true })
    cpSync(join(payload, entry.name), destination, { recursive: true, force: true })
  }
}

export function deleteSnapshot(instanceId: string, snapshotId: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(snapshotId)) throw new Error('Invalid snapshot ID.')
  const root = join(snapshotsDir(instanceId), snapshotId)
  const snapshot = readSnapshot(root)
  if (!snapshot || snapshot.instanceId !== instanceId) throw new Error('Snapshot not found.')
  rmSync(root, { recursive: true, force: true })
}

function trimSnapshots(instanceId: string): void {
  const dir = snapshotsDir(instanceId)
  const snapshots = listSnapshots(instanceId)
  const expired = [
    ...snapshots.filter((snapshot) => snapshot.reason === 'pre-update').slice(3),
    ...snapshots.filter((snapshot) => snapshot.reason === 'manual').slice(5)
  ]
  for (const snapshot of expired) {
    rmSync(join(dir, snapshot.id), { recursive: true, force: true })
  }
}
