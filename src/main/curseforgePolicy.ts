import { CURSEFORGE_ENABLED } from '../shared/features'

export const CURSEFORGE_DISABLED = 'CURSEFORGE_DISABLED' as const

export class CurseForgeDisabledError extends Error {
  readonly code = CURSEFORGE_DISABLED

  constructor() {
    super(CURSEFORGE_DISABLED)
    this.name = 'CurseForgeDisabledError'
  }
}

export function assertCurseForgeEnabled(): void {
  if (!CURSEFORGE_ENABLED) throw new CurseForgeDisabledError()
}

export function isCurseForgeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === 'curseforge.com'
    || host.endsWith('.curseforge.com')
    || host === 'forgecdn.net'
    || host.endsWith('.forgecdn.net')
    || host.includes('curseforge')
    || host.includes('forgecdn')
}

export function isCurseForgeUrl(input: string | URL): boolean {
  try {
    return isCurseForgeHost(new URL(String(input)).hostname)
  } catch {
    return false
  }
}

export function assertCurseForgeUrlAllowed(input: string | URL | Request): void {
  if (CURSEFORGE_ENABLED) return
  const url = input instanceof Request ? input.url : input
  if (isCurseForgeUrl(url)) throw new CurseForgeDisabledError()
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 20

function redirectedMethod(status: number, method: string): string {
  if (status === 303 && method !== 'GET' && method !== 'HEAD') return 'GET'
  if ((status === 301 || status === 302) && method === 'POST') return 'GET'
  return method
}

/**
 * Follow redirects explicitly so every destination is checked before the
 * transport can contact it. Native fetch redirect handling is deliberately
 * disabled here because it otherwise validates only the first URL.
 */
export async function guardedMainFetch(
  transport: typeof fetch,
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  let request = new Request(input, init)
  let replayBody: ArrayBuffer | undefined
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    replayBody = await request.clone().arrayBuffer()
  }

  for (let redirectCount = 0; ; redirectCount++) {
    assertCurseForgeUrlAllowed(request)
    const response = await transport(request, { redirect: 'manual' })
    if (!REDIRECT_STATUSES.has(response.status)) return response

    const location = response.headers.get('location')
    if (!location) return response
    if (redirectCount >= MAX_REDIRECTS) throw new TypeError('Maximum redirect count exceeded')

    const nextUrl = new URL(location, response.url || request.url)
    assertCurseForgeUrlAllowed(nextUrl)

    const method = redirectedMethod(response.status, request.method)
    const headers = new Headers(request.headers)
    if (method === 'GET' || method === 'HEAD') {
      headers.delete('content-encoding')
      headers.delete('content-language')
      headers.delete('content-location')
      headers.delete('content-type')
      headers.delete('content-length')
      replayBody = undefined
    }
    if (nextUrl.origin !== new URL(request.url).origin) {
      headers.delete('authorization')
      headers.delete('proxy-authorization')
      headers.delete('cookie')
    }

    request = new Request(nextUrl, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : replayBody,
      redirect: 'manual',
      signal: request.signal
    })
  }
}

export function installMainFetchGuard(): void {
  if (CURSEFORGE_ENABLED) return
  const unguardedFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    return await guardedMainFetch(unguardedFetch, input, init)
  }
}

interface RequestFilter {
  urls: string[]
}

interface BeforeRequestDetails {
  url: string
}

interface BeforeRequestCallback {
  (response: { cancel: boolean }): void
}

interface WebRequestLike {
  onBeforeRequest(
    filter: RequestFilter,
    listener: (details: BeforeRequestDetails, callback: BeforeRequestCallback) => void
  ): void
}

export function installSessionRequestGuard(webRequest: WebRequestLike): void {
  if (CURSEFORGE_ENABLED) return
  webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => callback({ cancel: isCurseForgeUrl(details.url) })
  )
}

export function assertCurseForgeSourceAllowed(source: unknown): void {
  if (source === 'curseforge') assertCurseForgeEnabled()
}

const CURSEFORGE_ONLY_IPC = new Set([
  'browse:curseforge',
  'instance:importMissingCurseForgeMod',
  'modpack:missingCurseForgeFiles',
  'modpack:enrichCurseForgeImport'
])

export function assertCurseForgeIpcAllowed(channel: string, args: unknown[]): void {
  if (CURSEFORGE_ONLY_IPC.has(channel)) assertCurseForgeEnabled()
  if (channel === 'shell:openExternal' || channel === 'update:openDownload') {
    assertCurseForgeUrlAllowed(String(args[0] ?? ''))
  }
  if (channel === 'instances:create') {
    assertCurseForgeSourceAllowed((args[0] as { source?: unknown } | undefined)?.source)
  }
  if (channel === 'settings:set' && Object.prototype.hasOwnProperty.call(args[0] ?? {}, 'curseforgeApiKey')) {
    assertCurseForgeEnabled()
  }
  if (channel === 'customMods:search' || channel === 'customMods:install') {
    assertCurseForgeSourceAllowed(args[2])
  }
  if (channel === 'customMods:toggle' || channel === 'customMods:remove') {
    assertCurseForgeSourceAllowed(args[1])
  }
}
