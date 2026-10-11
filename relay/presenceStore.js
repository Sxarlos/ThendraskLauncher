function expirePresence(store, now, ttl) {
  for (const [code, entry] of store) {
    if (now - entry.updatedAt > ttl) store.delete(code)
  }
}

function hasPresenceCapacity(store, code, now, ttl, limit) {
  expirePresence(store, now, ttl)
  return store.has(code) || store.size < limit
}

module.exports = { expirePresence, hasPresenceCapacity }
