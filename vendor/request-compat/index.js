'use strict'

const { PassThrough } = require('stream')
const { rmSync } = require('fs')

function createLimiter(maxConcurrent) {
  const limit = Number.isFinite(maxConcurrent) && maxConcurrent > 0
    ? Math.floor(maxConcurrent)
    : Infinity
  let active = 0
  const waiting = []

  return async function acquire() {
    if (active >= limit) {
      await new Promise((resolve) => waiting.push(resolve))
    }
    active++
    let released = false
    return () => {
      if (released) return
      released = true
      active--
      waiting.shift()?.()
    }
  }
}

function responseDetails(response) {
  return {
    statusCode: response.status,
    statusMessage: response.statusText,
    headers: Object.fromEntries(response.headers.entries())
  }
}

function normalizeOptions(input, defaults, method) {
  const supplied = typeof input === 'string' || input instanceof URL
    ? { url: String(input) }
    : { ...input }
  const headers = {
    ...(defaults.headers || {}),
    ...(supplied.headers || {})
  }
  const options = {
    ...defaults,
    ...supplied,
    headers,
    method: method || supplied.method || defaults.method || 'GET'
  }

  let body = options.body
  let parseJson = options.json === true
  if (options.json && options.json !== true) {
    body = JSON.stringify(options.json)
    parseJson = true
    if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) {
      headers['content-type'] = 'application/json'
    }
  }

  return {
    url: String(options.url || options.uri),
    method: String(options.method).toUpperCase(),
    headers,
    body,
    parseJson,
    timeout: Number(options.timeout) || 0
  }
}

class RequestOperation extends PassThrough {
  constructor(options, callback, acquire) {
    super()
    this.requestOptions = options
    this.callback = callback
    this.acquire = acquire
    this.destinations = new Set()
    queueMicrotask(() => void this.run())
  }

  pipe(destination, options) {
    this.destinations.add(destination)
    destination.once('close', () => this.destinations.delete(destination))
    return super.pipe(destination, options)
  }

  scheduleDestinationCleanup() {
    for (const destination of this.destinations) {
      if (typeof destination.path !== 'string') continue
      const path = destination.path
      destination.once('close', () => {
        try {
          rmSync(path, { force: true })
        } catch {
          // Best-effort cleanup: the destination may already have removed the file.
        }
      })
    }
  }

  fail(error) {
    if (this.callback) {
      this.callback(error)
      this.end()
      return
    }
    if (this.destinations.size > 0) {
      this.scheduleDestinationCleanup()
      for (const destination of this.destinations) destination.destroy(error)
      this.end()
      return
    }
    this.destroy(error)
  }

  async run() {
    const release = await this.acquire()
    const controller = new AbortController()
    const timer = this.requestOptions.timeout > 0
      ? setTimeout(() => controller.abort(new Error('Request timed out')), this.requestOptions.timeout)
      : undefined
    timer?.unref()

    try {
      const response = await globalThis.fetch(this.requestOptions.url, {
        method: this.requestOptions.method,
        headers: this.requestOptions.headers,
        body: this.requestOptions.method === 'GET' || this.requestOptions.method === 'HEAD'
          ? undefined
          : this.requestOptions.body,
        signal: controller.signal
      })
      const details = responseDetails(response)

      if (this.callback) {
        const text = await response.text()
        let body = text
        if (this.requestOptions.parseJson) {
          body = text.length > 0 ? JSON.parse(text) : undefined
        }
        this.callback(null, details, body)
        this.end()
        return
      }

      this.emit('response', details)
      if (response.status === 404) {
        this.scheduleDestinationCleanup()
        this.end()
        return
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'request failed'}`)
      }

      if (response.body) {
        for await (const chunk of response.body) {
          if (!this.write(Buffer.from(chunk))) {
            await new Promise((resolve) => this.once('drain', resolve))
          }
        }
      }
      this.end()
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    } finally {
      if (timer) clearTimeout(timer)
      release()
    }
  }
}

function createRequester(defaults = {}) {
  const acquire = createLimiter(defaults.pool?.maxSockets)

  function requester(input, callback) {
    return new RequestOperation(normalizeOptions(input, defaults), callback, acquire)
  }

  requester.get = (input, callback) =>
    new RequestOperation(normalizeOptions(input, defaults, 'GET'), callback, acquire)
  requester.post = (input, callback) =>
    new RequestOperation(normalizeOptions(input, defaults, 'POST'), callback, acquire)
  requester.defaults = (nextDefaults) => createRequester({ ...defaults, ...nextDefaults })

  return requester
}

module.exports = createRequester()
