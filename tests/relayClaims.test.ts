import { createRequire } from 'module'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createClaims } = require('../relay/claims.js')
const { hasPresenceCapacity } = require('../relay/presenceStore.js')

describe('durable relay ownership', () => {
  it('retains ownership across restarts', () => {
    const root = mkdtempSync(join(tmpdir(), 'thendrask-claims-'))
    try {
      const claims = createClaims(root)
      expect(claims.authorize('ABCDE12345', 'owner')).toBe(true)
      expect(createClaims(root).authorize('ABCDE12345', 'owner')).toBe(true)
      expect(createClaims(root).authorize('ABCDE12345', 'impostor')).toBe(false)
      expect(claims.authorize('ABCDE12346', 'another owner')).toBe(true)
      expect(() => claims.authorize('../outside', 'secret')).toThrow()
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
  it('admits new peers after expiry and permits existing peers to renew at capacity', () => {
    const store = new Map([['first', { updatedAt: 0 }], ['second', { updatedAt: 50 }]])
    expect(hasPresenceCapacity(store, 'third', 80, 90, 2)).toBe(false)
    expect(hasPresenceCapacity(store, 'second', 80, 90, 2)).toBe(true)
    expect(hasPresenceCapacity(store, 'third', 100, 90, 2)).toBe(true)
    expect(store.has('first')).toBe(false)
    expect(store.has('second')).toBe(true)
  })

})
