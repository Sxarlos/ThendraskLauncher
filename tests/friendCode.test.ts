import { describe, it, expect } from 'vitest'
import { normalizeFriendCode, formatFriendCode } from '../src/shared/friendCode'

describe('normalizeFriendCode', () => {
  it('accepts a bare 10-char code', () => {
    expect(normalizeFriendCode('ABC12DEF34')).toBe('ABC12DEF34')
  })

  it('strips dashes and spaces and uppercases', () => {
    expect(normalizeFriendCode('abc12-def34')).toBe('ABC12DEF34')
    expect(normalizeFriendCode(' abc12 def34 ')).toBe('ABC12DEF34')
  })

  it('rejects wrong lengths and invalid characters', () => {
    expect(normalizeFriendCode('ABC12DEF3')).toBeNull()
    expect(normalizeFriendCode('ABC12DEF345')).toBeNull()
    expect(normalizeFriendCode('ABC12DEF3!')).toBeNull()
    expect(normalizeFriendCode('')).toBeNull()
  })
})

describe('formatFriendCode', () => {
  it('formats as XXXXX-XXXXX', () => {
    expect(formatFriendCode('ABC12DEF34')).toBe('ABC12-DEF34')
  })
})
