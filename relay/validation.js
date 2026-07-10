function isValidCode(code) {
  return typeof code === 'string' && /^[0-9A-Z]{10}$/.test(code)
}

function presenceBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : null
  return {
    username: text(body.username, 32) || 'Unknown',
    idle: body.idle === true,
    playing: text(body.playing, 100),
    mcVersion: text(body.mcVersion, 32),
    loader: text(body.loader, 32),
    since: Number.isFinite(body.since) ? body.since : null,
    appVersion: text(body.appVersion, 32)
  }
}

module.exports = { isValidCode, presenceBody }
