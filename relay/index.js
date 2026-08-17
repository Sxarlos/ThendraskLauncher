const express = require('express')
const { isValidCode, presenceBody } = require('./validation')
const { isAllowedCurseForgeRequest, validCurseForgeBody } = require('./curseforge')
const app = express()
app.set('trust proxy', 1)

app.use(express.json({ limit: '4kb' }))

// CORS: allow the Electron renderer and any future web client
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const PORT = process.env.PORT || 3001
const TTL_MS = 90_000 // 90 s; if a client hasn't updated, it's offline

// Map<code, { data: object, updatedAt: number }>
const store = new Map()
const claims = new Map()
const rateLimits = new Map()
const MAX_PEERS = 10_000
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 120
const CURSEFORGE_BASE = 'https://api.curseforge.com'
const CURSEFORGE_TIMEOUT_MS = 12_000
const CURSEFORGE_MAX_RESPONSE_BYTES = 5 * 1024 * 1024

app.use((req, res, next) => {
  const key = req.ip
  const now = Date.now()
  const current = rateLimits.get(key)
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateLimits.set(key, { startedAt: now, count: 1 })
    return next()
  }
  current.count++
  if (current.count > RATE_LIMIT) return res.status(429).json({ error: 'rate_limited' })
  next()
})

// Clean up stale entries every minute
setInterval(() => {
  const cutoff = Date.now() - TTL_MS
  for (const [code, entry] of store) {
    if (entry.updatedAt < cutoff) store.delete(code)
  }
  for (const [ip, entry] of rateLimits) {
    if (entry.startedAt < Date.now() - RATE_WINDOW_MS) rateLimits.delete(ip)
  }
}, 60_000)

// Authenticated CurseForge API proxy. The API key stays on this server; the
// launcher can only reach the small, validated endpoint set it actually uses.
app.use('/curseforge', async (req, res) => {
  const apiKey = process.env.CURSEFORGE_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'curseforge_not_configured' })

  const requestUrl = new URL(req.originalUrl, 'https://relay.invalid')
  const pathname = requestUrl.pathname.slice('/curseforge'.length)
  if (!isAllowedCurseForgeRequest(req.method, pathname, requestUrl.searchParams)) {
    return res.status(404).json({ error: 'curseforge_route_not_allowed' })
  }
  if (req.method === 'POST' && !validCurseForgeBody(pathname, req.body)) {
    return res.status(400).json({ error: 'invalid_curseforge_request' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CURSEFORGE_TIMEOUT_MS)
  try {
    const upstream = await fetch(`${CURSEFORGE_BASE}${pathname}${requestUrl.search}`, {
      method: req.method,
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
        ...(req.method === 'POST' ? { 'Content-Type': 'application/json' } : {})
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
      signal: controller.signal
    })
    const declaredLength = Number(upstream.headers.get('content-length') ?? 0)
    if (declaredLength > CURSEFORGE_MAX_RESPONSE_BYTES) {
      return res.status(502).json({ error: 'curseforge_response_too_large' })
    }
    const body = Buffer.from(await upstream.arrayBuffer())
    if (body.length > CURSEFORGE_MAX_RESPONSE_BYTES) {
      return res.status(502).json({ error: 'curseforge_response_too_large' })
    }
    const contentType = upstream.headers.get('content-type') || 'application/json'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(upstream.status).send(body)
  } catch (error) {
    if (error?.name === 'AbortError') return res.status(504).json({ error: 'curseforge_timeout' })
    console.error('[relay] CurseForge request failed:', error)
    return res.status(502).json({ error: 'curseforge_unavailable' })
  } finally {
    clearTimeout(timeout)
  }
})

// PUT /presence/:code: register or refresh presence
app.put('/presence/:code', (req, res) => {
  const { code } = req.params
  if (!isValidCode(code)) return res.status(400).json({ error: 'invalid_code' })
  const secret = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) return res.status(401).json({ error: 'missing_secret' })
  const claimedSecret = claims.get(code)
  if (claimedSecret && claimedSecret !== secret) return res.status(403).json({ error: 'wrong_secret' })
  if (!claimedSecret && claims.size >= MAX_PEERS) return res.status(503).json({ error: 'capacity_reached' })
  const data = presenceBody(req.body)
  if (!data) return res.status(400).json({ error: 'invalid_presence' })
  if (!claimedSecret) claims.set(code, secret)
  store.set(code, { secret, data, updatedAt: Date.now() })
  res.json({ ok: true })
})

// GET /presence/:code: query a friend's presence
app.get('/presence/:code', (req, res) => {
  const { code } = req.params
  if (!isValidCode(code)) return res.status(400).json({ error: 'invalid_code' })
  const entry = store.get(code)
  if (!entry || Date.now() - entry.updatedAt > TTL_MS) {
    return res.json({ online: false })
  }
  res.json({ ...entry.data, online: true })
})

// GET /health: uptime check
app.get('/health', (_req, res) => res.json({
  ok: true,
  peers: store.size,
  curseforge: Boolean(process.env.CURSEFORGE_API_KEY)
}))

app.listen(PORT, () => console.log(`[relay] Listening on :${PORT}`))
