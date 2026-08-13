import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { isValidCode, presenceBody } = require('../relay/validation.js') as {
  isValidCode: (code: unknown) => boolean
  presenceBody: (body: unknown) => Record<string, unknown> | null
}
const { isAllowedCurseForgeRequest, validCurseForgeBody } = require('../relay/curseforge.js') as {
  isAllowedCurseForgeRequest: (method: string, path: string, params?: URLSearchParams) => boolean
  validCurseForgeBody: (path: string, body: unknown) => boolean
}

describe('presence relay validation', () => {
  it('accepts only canonical friend codes', () => {
    expect(isValidCode('ABC12DEF34')).toBe(true)
    expect(isValidCode('abc12def34')).toBe(false)
    expect(isValidCode('../ABC1234')).toBe(false)
  })

  it('sanitizes and bounds public presence fields', () => {
    const body = presenceBody({
      username: 'x'.repeat(100),
      idle: 'yes',
      playing: 'Pack',
      since: Number.NaN,
      injected: { secret: true }
    })
    expect(body?.username).toBe('x'.repeat(32))
    expect(body?.idle).toBe(false)
    expect(body?.playing).toBe('Pack')
    expect(body?.since).toBeNull()
    expect(body).not.toHaveProperty('injected')
  })

  it('rejects non-object bodies', () => {
    expect(presenceBody(null)).toBeNull()
    expect(presenceBody([])).toBeNull()
  })
})

describe('CurseForge relay validation', () => {
  it('allows only the API routes used by the launcher', () => {
    expect(isAllowedCurseForgeRequest('GET', '/v1/mods/search', new URLSearchParams('gameId=432&pageSize=20'))).toBe(true)
    expect(isAllowedCurseForgeRequest('GET', '/v1/mods/123/files/456/download-url')).toBe(true)
    expect(isAllowedCurseForgeRequest('GET', '/v1/games')).toBe(false)
    expect(isAllowedCurseForgeRequest('DELETE', '/v1/mods/123')).toBe(false)
    expect(isAllowedCurseForgeRequest('GET', '/v1/mods/search', new URLSearchParams('pageSize=500'))).toBe(false)
  })

  it('bounds batch request bodies', () => {
    expect(validCurseForgeBody('/v1/mods', { modIds: [1, 2, 3] })).toBe(true)
    expect(validCurseForgeBody('/v1/mods/files', { fileIds: [10, 20] })).toBe(true)
    expect(validCurseForgeBody('/v1/mods/files', { fileIds: [] })).toBe(false)
    expect(validCurseForgeBody('/v1/mods', { modIds: ['1'] })).toBe(false)
    expect(validCurseForgeBody('/v1/mods', { modIds: [1], extra: true })).toBe(false)
  })
})
