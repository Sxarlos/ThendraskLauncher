import { createWriteStream, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { Writable } from 'stream'
import { once } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installMainFetchGuard } from '../src/main/curseforgePolicy'

const require = createRequire(import.meta.url)
const request = require('../vendor/request-compat') as {
  (input: string | Record<string, unknown>, callback?: RequestCallback): NodeJS.ReadWriteStream
  get(input: string | Record<string, unknown>, callback: RequestCallback): NodeJS.ReadWriteStream
  post(input: string | Record<string, unknown>, callback: RequestCallback): NodeJS.ReadWriteStream
  defaults(options: Record<string, unknown>): typeof request
}

interface CompatResponse {
  statusCode: number
  statusMessage: string
  headers: Record<string, string>
}

type RequestCallback = (error: Error | null, response?: CompatResponse, body?: unknown) => void

let testRoot = ''

afterEach(() => {
  vi.unstubAllGlobals()
  if (testRoot && existsSync(testRoot)) rmSync(testRoot, { recursive: true, force: true })
  testRoot = ''
})

function memoryDestination(): { destination: Writable; chunks: Buffer[] } {
  const chunks: Buffer[] = []
  return {
    chunks,
    destination: new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      }
    })
  }
}

describe('launcher-core request compatibility transport', () => {
  it('streams successful downloads and exposes response metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('minecraft-data', {
      status: 200,
      headers: { 'content-length': '14' }
    })))
    const { destination, chunks } = memoryDestination()
    const operation = request('https://resources.download.minecraft.net/file')
    const responses: CompatResponse[] = []
    operation.on('response', (response) => responses.push(response))
    operation.pipe(destination)

    await once(destination, 'finish')
    expect(Buffer.concat(chunks).toString()).toBe('minecraft-data')
    expect(responses).toMatchObject([{ statusCode: 200, headers: { 'content-length': '14' } }])
  })

  it('supports JSON POST callbacks used by launcher authentication', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      accessToken: 'obviously-fake-token'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new Promise<{ response?: CompatResponse; body?: unknown }>((resolve, reject) => {
      request.post({
        url: 'https://authserver.mojang.com/authenticate',
        json: { username: 'TestPlayer', password: 'obviously-fake-password' }
      }, (error, response, body) => {
        if (error) reject(error)
        else resolve({ response, body })
      })
    })

    expect(result.response?.statusCode).toBe(200)
    expect(result.body).toEqual({ accessToken: 'obviously-fake-token' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://authserver.mojang.com/authenticate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          username: 'TestPlayer',
          password: 'obviously-fake-password'
        })
      })
    )
  })

  it('rejects failed downloads and removes partially written files', async () => {
    testRoot = mkdtempSync(join(tmpdir(), 'thendrask-request-'))
    const destinationPath = join(testRoot, 'partial.jar')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('partial'))
        controller.error(new Error('connection reset'))
      }
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))

    const destination = createWriteStream(destinationPath)
    const errorPromise = once(destination, 'error')
    const closePromise = new Promise<void>((resolveClose) => {
      destination.once('close', resolveClose)
    })
    request('https://libraries.minecraft.net/example.jar').pipe(destination)
    const [[error]] = await Promise.all([errorPromise, closePromise]) as [[Error], void]

    expect(error.message).toContain('connection reset')
    expect(existsSync(destinationPath)).toBe(false)
  })

  it('does not keep a file for a 404 response', async () => {
    testRoot = mkdtempSync(join(tmpdir(), 'thendrask-request-'))
    const destinationPath = join(testRoot, 'missing.jar')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })))

    const destination = createWriteStream(destinationPath)
    request('https://libraries.minecraft.net/missing.jar').pipe(destination)
    await once(destination, 'close')

    expect(existsSync(destinationPath)).toBe(false)
  })

  it('blocks a redirect to ForgeCDN before the redirected request is sent', async () => {
    const transport = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://edge.forgecdn.net/files/blocked.jar' }
    }))
    vi.stubGlobal('fetch', transport)
    installMainFetchGuard()
    const { destination } = memoryDestination()

    request('https://libraries.minecraft.net/redirect').pipe(destination)
    const [error] = await once(destination, 'error') as [Error & { code?: string }]

    expect(error.code).toBe('CURSEFORGE_DISABLED')
    expect(transport).toHaveBeenCalledOnce()
  })

  it('follows redirects between allowed Minecraft hosts', async () => {
    const transport = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url === 'https://launchermeta.mojang.com/manifest') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://piston-meta.mojang.com/manifest' }
        })
      }
      return new Response('manifest')
    })
    vi.stubGlobal('fetch', transport)
    installMainFetchGuard()
    const { destination, chunks } = memoryDestination()

    request('https://launchermeta.mojang.com/manifest').pipe(destination)
    await once(destination, 'finish')

    expect(Buffer.concat(chunks).toString()).toBe('manifest')
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('uses the installed local transport rather than deprecated request', () => {
    const installed = require('request/package.json') as { version: string }
    expect(installed.version).toBe('3.0.0-thendrask.1')
    expect(readFileSync(resolve('node_modules/request/index.js'), 'utf8'))
      .toContain('globalThis.fetch')
  })
})
