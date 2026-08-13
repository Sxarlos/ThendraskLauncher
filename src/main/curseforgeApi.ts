import { getSettings } from './settings'
import { assertCurseForgeEnabled } from './curseforgePolicy'

const CURSEFORGE_ORIGIN = 'https://api.curseforge.com'

function apiPath(input: string | URL): string {
  const raw = String(input)
  if (raw.startsWith('/')) return raw.startsWith('/v1/') ? raw : `/v1${raw}`
  const url = new URL(raw)
  if (url.origin !== CURSEFORGE_ORIGIN || !url.pathname.startsWith('/v1/')) {
    throw new Error('Invalid CurseForge API URL.')
  }
  return `${url.pathname}${url.search}`
}

export async function curseForgeFetch(
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  assertCurseForgeEnabled()
  const configuredRelay = getSettings().relayUrl?.trim()
  if (!configuredRelay) {
    throw new Error('The Thendrask relay is not configured. Add its URL in Settings → Connections.')
  }
  const relay = new URL(configuredRelay)
  if (relay.protocol !== 'https:' && relay.protocol !== 'http:') {
    throw new Error('The Thendrask relay URL must use HTTP or HTTPS.')
  }

  const headers = new Headers(init.headers)
  headers.delete('x-api-key')
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  const path = apiPath(input)
  const url = new URL(`/curseforge${path}`, `${relay.origin}/`)
  return fetch(url, { ...init, headers })
}
