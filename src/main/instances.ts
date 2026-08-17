import { existsSync, mkdirSync, rmSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Instance, LoaderType } from '@shared/types'
import { instancesDir, readJson, writeJson } from './persist'
import { isValidInstanceId, safeJoin } from './safePath'

const FILE = 'instances.json'
const APPROVED_INSTANCE_SOURCES = new Set<NonNullable<Instance['source']>>([
  'manual',
  'modrinth',
  'curseforge'
])

function load(): Instance[] {
  type StoredInstance = Omit<Instance, 'source'> & { source?: string }
  return readJson<StoredInstance[]>(FILE, []).map(({ source, ...instance }) => {
    const normalizedSource = source ?? 'manual'
    if (APPROVED_INSTANCE_SOURCES.has(normalizedSource as NonNullable<Instance['source']>)) {
      return { ...instance, source: normalizedSource as Instance['source'] }
    }
    return { ...instance, source: 'manual', externalId: undefined, packVersionId: undefined }
  })
}

function save(list: Instance[]): void {
  writeJson(FILE, list)
}

export function listInstances(): Instance[] {
  return load().sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
}

/** Remove CurseForge gallery URLs saved by older builds. CurseForge images are now fetched live only. */
export function removePersistedCurseForgeScreenshots(): number {
  const list = load()
  let changed = 0
  for (const instance of list) {
    if (instance.source !== 'curseforge' || !instance.screenshotUrls?.length) continue
    delete instance.screenshotUrls
    changed++
  }
  if (changed > 0) save(list)
  return changed
}

export function getInstance(id: string): Instance | undefined {
  return load().find((i) => i.id === id)
}

/** The .minecraft (game) directory for an instance. */
export function instanceGameDir(id: string): string {
  const root = instanceRootDir(id)
  const dir = safeJoin(root, 'minecraft')
  if (!dir) throw new Error('Invalid instance game directory.')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolve an instance root while refusing traversal and non-existent IDs. */
export function instanceRootDir(id: string): string {
  if (!isValidInstanceId(id)) {
    throw new Error('Invalid instance ID.')
  }
  if (!getInstance(id)) throw new Error('Instance not found.')
  const dir = safeJoin(instancesDir(), id)
  if (!dir) throw new Error('Invalid instance directory.')
  return dir
}

export interface CreateInstanceInput {
  name: string
  mcVersion: string
  loader?: LoaderType
  loaderVersion?: string
  source?: Instance['source']
  externalId?: string
  packVersionId?: string
  iconUrl?: string
}

export function createInstance(input: CreateInstanceInput): Instance {
  const instance: Instance = {
    id: randomUUID(),
    name: input.name.trim() || 'New Instance',
    mcVersion: input.mcVersion,
    loader: input.loader ?? 'vanilla',
    loaderVersion: input.loaderVersion,
    source: input.source ?? 'manual',
    externalId: input.externalId,
    packVersionId: input.packVersionId,
    iconUrl: input.iconUrl
  }
  const list = load()
  list.push(instance)
  save(list)
  instanceGameDir(instance.id) // pre-create the game dir
  return instance
}

export function updateInstance(id: string, patch: Partial<Instance>): Instance | undefined {
  const list = load()
  const inst = list.find((i) => i.id === id)
  if (!inst) return undefined
  if (Object.prototype.hasOwnProperty.call(patch, 'id')) throw new Error('Instance ID cannot be changed.')
  Object.assign(inst, patch)
  save(list)
  return inst
}

export function markPlayed(id: string): void {
  updateInstance(id, { lastPlayed: Date.now() })
}

export function addPlayTime(id: string, ms: number): void {
  const inst = getInstance(id)
  if (!inst) return
  updateInstance(id, { timePlayed: (inst.timePlayed ?? 0) + ms })
}

export function removeInstance(id: string, deleteFiles = false): Instance[] {
  const root = instanceRootDir(id)
  save(load().filter((i) => i.id !== id))
  if (deleteFiles && existsSync(root)) rmSync(root, { recursive: true, force: true })
  return listInstances()
}
