import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { isValidCode, presenceBody } = require('../relay/validation.js') as {
  isValidCode: (code: unknown) => boolean
  presenceBody: (body: unknown) => Record<string, unknown> | null
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
