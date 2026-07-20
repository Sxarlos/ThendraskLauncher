const express = require('express')
const { isValidCode, presenceBody } = require('./validation')
const app = express()
app.set('trust proxy', 1)

app.use(express.json({ limit: '4kb' }))

// CORS: allow the Electron renderer and any future web client
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
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
app.get('/health', (_req, res) => res.json({ ok: true, peers: store.size }))

app.listen(PORT, () => console.log(`[relay] Listening on :${PORT}`))
