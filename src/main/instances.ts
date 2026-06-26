import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Instance, LoaderType } from '@shared/types'
import { instancesDir, readJson, writeJson } from './persist'

const FILE = 'instances.json'

function load(): Instance[] {
  return readJson<Instance[]>(FILE, [])
}

function save(list: Instance[]): void {
  writeJson(FILE, list)
}

export function listInstances(): Instance[] {
  return load().sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
}

export function getInstance(id: string): Instance | undefined {
  return load().find((i) => i.id === id)
}

/** The .minecraft (game) directory for an instance. */
export function instanceGameDir(id: string): string {
  const dir = join(instancesDir(), id, 'minecraft')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
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
  Object.assign(inst, patch)
  save(list)
  return inst
}

export function markPlayed(id: string): void {
  updateInstance(id, { lastPlayed: Date.now() })
}

export function removeInstance(id: string): Instance[] {
  save(load().filter((i) => i.id !== id))
  return listInstances()
}
