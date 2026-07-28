import { EventEmitter } from 'events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const Handler = require('minecraft-launcher-core/components/handler')
const { Authenticator } = require('minecraft-launcher-core') as {
  Authenticator: {
    getAuth(username: string): Promise<{
      name: string
      uuid: string
      access_token: string
    }>
  }
}

let testRoot = ''

afterEach(() => {
  vi.unstubAllGlobals()
  if (testRoot && existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true })
  testRoot = ''
})

describe('minecraft-launcher-core dependency replacements', () => {
  it('downloads through the local request transport', async () => {
    testRoot = mkdtempSync(join(tmpdir(), 'thendrask-mclc-'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('launcher-library', {
      status: 200,
      headers: { 'content-length': '16' }
    })))

    const client = Object.assign(new EventEmitter(), {
      options: {
        overrides: { maxSockets: 2 },
        timeout: 5_000
      }
    })
    const handler = new Handler(client)
    const result = await handler.downloadAsync(
      'https://libraries.minecraft.net/example.jar',
      testRoot,
      'example.jar',
      false,
      'libraries'
    )

    expect(result).toEqual({ failed: false, asset: null })
    expect(readFileSync(join(testRoot, 'example.jar'), 'utf8')).toBe('launcher-library')
  })

  it('keeps offline authentication working with the upgraded UUID package', async () => {
    const authorization = await Authenticator.getAuth('TestPlayer')

    expect(authorization).toMatchObject({
      name: 'TestPlayer',
      uuid: authorization.access_token
    })
    expect(authorization.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
