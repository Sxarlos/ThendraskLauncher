import { app } from 'electron'
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, extname, join } from 'path'
import AdmZip from 'adm-zip'
import type { InstanceRepairResult, InstanceStorageInfo } from '@shared/types'
import { createInstance, getInstance, instanceGameDir, instanceRootDir, removeInstance, updateInstance } from './instances'
import { createSnapshot } from './snapshots'
import { invalidateMarker } from './modpack'
import { detectAllJavas } from './java'
import { safeJoin } from './safePath'
import type { Instance, LoaderType } from '@shared/types'

const MAX_BACKUP_ENTRIES = 100_000
const MAX_BACKUP_EXPANDED_BYTES = 20 * 1024 * 1024 * 1024
const MAX_BACKUP_ENTRY_BYTES = 256 * 1024 * 1024
const MAX_COMPRESSION_RATIO = 1_000

function sizeOf(path: string): number {
  if (!existsSync(path)) return 0
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) return 0
  if (!stat.isDirectory()) return stat.size
  return readdirSync(path).reduce((total, name) => total + sizeOf(join(path, name)), 0)
}

export function instanceStorage(instanceId: string): InstanceStorageInfo {
  const root = instanceRootDir(instanceId)
  const game = instanceGameDir(instanceId)
  return {
    totalBytes: sizeOf(root),
    modsBytes: sizeOf(join(game, 'mods')),
    savesBytes: sizeOf(join(game, 'saves')),
    snapshotsBytes: sizeOf(join(root, 'snapshots'))
  }
}

export function repairInstance(instanceId: string): InstanceRepairResult {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('Instance not found.')
  const snapshot = createSnapshot(instanceId, 'manual', `Before repairing ${instance.name}`)
  const game = instanceGameDir(instanceId)
  let removedBrokenFiles = 0
  for (const directory of ['mods', 'libraries', 'versions']) {
    const root = join(game, directory)
    if (!existsSync(root)) continue
    const visit = (path: string): void => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const full = join(path, entry.name)
        if (entry.isDirectory()) visit(full)
        else if (entry.name.endsWith('.part') || statSync(full).size === 0) {
          rmSync(full, { force: true })
          removedBrokenFiles++
        }
      }
    }
    visit(root)
  }
  const reinstallScheduled = instance.source !== 'manual' && !!instance.externalId
  if (reinstallScheduled) invalidateMarker(instanceId)
  return { removedBrokenFiles, reinstallScheduled, snapshotId: snapshot.id }
}

export async function createDiagnosticBundle(instanceId?: string): Promise<string> {
  const instance = instanceId ? getInstance(instanceId) : undefined
  if (instanceId && !instance) throw new Error('Instance not found.')
  const zip = new AdmZip()
  const report = {
    generatedAt: new Date().toISOString(),
    launcherVersion: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    instance: instance ?? null,
    storage: instanceId ? instanceStorage(instanceId) : null,
    java: await detectAllJavas()
  }
  zip.addFile('report.json', Buffer.from(JSON.stringify(report, null, 2), 'utf-8'))
  if (instanceId) {
    const game = instanceGameDir(instanceId)
    const latestLog = join(game, 'logs', 'latest.log')
    if (existsSync(latestLog)) zip.addLocalFile(latestLog, 'logs')
  }
  const safeName = (instance?.name ?? 'launcher').replace(/[^A-Za-z0-9._-]/g, '_')
  const output = join(app.getPath('downloads'), `Thendrask-Diagnostics-${safeName}-${Date.now()}.zip`)
  zip.writeZip(output)
  return output
}

export function exportInstanceBackup(instanceId: string): string {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('Instance not found.')
  const zip = new AdmZip()
  zip.addFile('thendrask-backup.json', Buffer.from(JSON.stringify({
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    instance
  }, null, 2), 'utf-8'))
  const excluded = new Set(['assets', 'libraries', 'versions', 'logs', 'crash-reports', 'screenshots'])
  const game = instanceGameDir(instanceId)
  for (const entry of readdirSync(game, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue
    const source = join(game, entry.name)
    if (entry.isDirectory()) zip.addLocalFolder(source, `minecraft/${entry.name}`)
    else zip.addLocalFile(source, 'minecraft')
  }
  const safeName = instance.name.replace(/[^A-Za-z0-9._-]/g, '_')
  const output = join(app.getPath('downloads'), `Thendrask-Backup-${safeName}-${Date.now()}.zip`)
  zip.writeZip(output)
  return output
}

export function importInstanceBackup(filePath: string): Instance {
  if (extname(filePath).toLowerCase() !== '.zip') throw new Error('Backup must be a .zip file.')
  const zip = new AdmZip(filePath)
  const entries = zip.getEntries()
  const expandedBytes = entries.reduce((total, entry) => total + Number(entry.header.size ?? 0), 0)
  if (entries.length > MAX_BACKUP_ENTRIES || expandedBytes > MAX_BACKUP_EXPANDED_BYTES) {
    throw new Error('Backup is too large to import safely.')
  }
  for (const entry of entries) {
    const size = Number(entry.header.size ?? 0)
    const compressedSize = Number(entry.header.compressedSize ?? 0)
    if (size > MAX_BACKUP_ENTRY_BYTES) throw new Error(`Backup entry is too large: ${entry.entryName}`)
    if (compressedSize > 0 && size / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new Error(`Backup entry has an unsafe compression ratio: ${entry.entryName}`)
    }
  }
  const manifestEntry = zip.getEntry('thendrask-backup.json')
  if (!manifestEntry) throw new Error('This is not a Thendrask portable backup.')
  const manifest = JSON.parse(manifestEntry.getData().toString('utf-8')) as {
    formatVersion?: number
    instance?: Partial<Instance>
  }
  const source = manifest.instance
  const loaders: LoaderType[] = ['vanilla', 'fabric', 'forge', 'quilt', 'neoforge']
  if (manifest.formatVersion !== 1 || !source || typeof source.name !== 'string' ||
      typeof source.mcVersion !== 'string' || !loaders.includes(source.loader as LoaderType)) {
    throw new Error('Backup manifest is invalid or unsupported.')
  }
  const restored = createInstance({
    name: `${source.name} (Restored)`,
    mcVersion: source.mcVersion,
    loader: source.loader as LoaderType,
    loaderVersion: source.loaderVersion,
    source: source.source,
    externalId: source.externalId,
    packVersionId: source.packVersionId,
    iconUrl: source.iconUrl
  })
  try {
    const game = instanceGameDir(restored.id)
    for (const entry of entries) {
      if (!entry.entryName.startsWith('minecraft/')) continue
      const relative = entry.entryName.slice('minecraft/'.length)
      if (!relative) continue
      const destination = safeJoin(game, relative)
      if (!destination) throw new Error(`Backup contains an unsafe path: ${entry.entryName}`)
      if (entry.isDirectory) mkdirSync(destination, { recursive: true })
      else {
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, entry.getData())
      }
    }
    return updateInstance(restored.id, {
      recommendedRamMb: source.recommendedRamMb,
      jvmArgs: source.jvmArgs,
      screenshotUrls: source.screenshotUrls,
      timePlayed: source.timePlayed
    }) ?? restored
  } catch (error) {
    removeInstance(restored.id, true)
    throw error
  }
}
