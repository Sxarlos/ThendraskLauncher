import { status } from 'minecraft-server-util'
import { randomUUID } from 'crypto'
import type { ServerEntry, ServerStatus } from '@shared/types'
import { readJson, writeJson } from './persist'

const FILE = 'servers.json'

export const PERMANENT_SERVERS: ServerEntry[] = []

const PERMANENT_HOSTS = new Set(PERMANENT_SERVERS.map((s) => s.host))

export function listServers(): ServerEntry[] {
  // Load user-added servers, stripping any that duplicate a permanent host
  // (migration: previously saved copies of the permanent servers).
  const saved = readJson<ServerEntry[]>(FILE, []).filter(
    (s) => !PERMANENT_HOSTS.has(s.host) && !s.id.startsWith('perm-')
  )
  return [...PERMANENT_SERVERS, ...saved]
}

export function addServer(data: Omit<ServerEntry, 'id'>): ServerEntry[] {
  const saved = readJson<ServerEntry[]>(FILE, []).filter(
    (s) => !PERMANENT_HOSTS.has(s.host) && !s.id.startsWith('perm-')
  )
  saved.push({ ...data, id: randomUUID() })
  writeJson(FILE, saved)
  return [...PERMANENT_SERVERS, ...saved]
}

export function removeServer(id: string): ServerEntry[] {
  if (id.startsWith('perm-')) return listServers() // permanent — ignore
  const saved = readJson<ServerEntry[]>(FILE, [])
    .filter((s) => s.id !== id && !PERMANENT_HOSTS.has(s.host) && !s.id.startsWith('perm-'))
  writeJson(FILE, saved)
  return [...PERMANENT_SERVERS, ...saved]
}

export async function pingServer(host: string, port = 25565): Promise<ServerStatus> {
  try {
    const res = await status(host, port, { timeout: 5000 })
    return {
      online: true,
      players: {
        online: res.players.online,
        max: res.players.max,
        sample: res.players.sample?.map((p) => p.name) ?? []
      },
      version: res.version.name,
      motd: res.motd.clean,
      favicon: res.favicon ?? undefined,
      latencyMs: res.roundTripLatency
    }
  } catch {
    return { online: false, error: 'Offline or unreachable' }
  }
}
