const express = require('express')
const app = express()

app.use(express.json())

// CORS — allow the Electron renderer and any future web client
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const PORT = process.env.PORT || 3001
const TTL_MS = 90_000 // 90 s — if a client hasn't updated, it's offline

// Map<code, { data: object, updatedAt: number }>
const store = new Map()

// Clean up stale entries every minute
setInterval(() => {
  const cutoff = Date.now() - TTL_MS
  for (const [code, entry] of store) {
    if (entry.updatedAt < cutoff) store.delete(code)
  }
}, 60_000)

function isValidCode(code) {
  return typeof code === 'string' && /^[0-9A-Z]{10}$/.test(code)
}

// PUT /presence/:code  — register or refresh presence
app.put('/presence/:code', (req, res) => {
  const { code } = req.params
  if (!isValidCode(code)) return res.status(400).json({ error: 'invalid_code' })
  store.set(code, { data: req.body ?? {}, updatedAt: Date.now() })
  res.json({ ok: true })
})

// GET /presence/:code  — query a friend's presence
app.get('/presence/:code', (req, res) => {
  const { code } = req.params
  if (!isValidCode(code)) return res.status(400).json({ error: 'invalid_code' })
  const entry = store.get(code)
  if (!entry || Date.now() - entry.updatedAt > TTL_MS) {
    return res.json({ online: false })
  }
  res.json({ ...entry.data, online: true })
})

// GET /health  — uptime check
app.get('/health', (_req, res) => res.json({ ok: true, peers: store.size }))

app.listen(PORT, () => console.log(`[relay] Listening on :${PORT}`))
