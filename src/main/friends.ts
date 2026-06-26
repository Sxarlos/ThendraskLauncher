import { randomBytes, randomUUID } from 'crypto'
import { net } from 'electron'
import type { Friend } from '@shared/types'
import { readJson, writeJson } from './persist'
import { getSettings } from './settings'

const FILE = 'friends.json'
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function generateFriendCode(): string {
  const bytes = randomBytes(10)
  let code = ''
  for (const b of bytes) code += CHARS[b % 36]
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

export function listFriends(): Friend[] {
  // Filter out any stale entries from the old host/port format
  return readJson<Friend[]>(FILE, []).filter((f) => typeof f.code === 'string')
}

export function addFriend(data: Omit<Friend, 'id'>): Friend[] {
  const friend: Friend = { ...data, id: randomUUID() }
  const list = listFriends()
  list.push(friend)
  writeJson(FILE, list)
  return list
}

export function removeFriend(id: string): Friend[] {
  const list = listFriends().filter((f) => f.id !== id)
  writeJson(FILE, list)
  return list
}

export async function pollFriend(code: string): Promise<object> {
  const { relayUrl } = getSettings()
  if (!relayUrl) throw new Error('No relay server configured — add a relay URL in Settings')
  const bare = code.replace(/-/g, '').toUpperCase()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await net.fetch(`${relayUrl}/presence/${bare}`, { signal: controller.signal })
    if (!res.ok) throw new Error(`Relay returned HTTP ${res.status}`)
    return await res.json() as object
  } finally {
    clearTimeout(timeout)
  }
}
