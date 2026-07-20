import { describe, expect, it } from 'vitest'
import { requiresChatPatch } from '../src/main/chatSupport'

describe('requiresChatPatch', () => {
  it('skips versions from before signed-chat enforcement', () => {
    expect(requiresChatPatch('1.7.10')).toBe(false)
    expect(requiresChatPatch('1.12.2')).toBe(false)
    expect(requiresChatPatch('1.18.2')).toBe(false)
    expect(requiresChatPatch('1.19')).toBe(false)
  })

  it('allows versions with chat signing/reporting restrictions', () => {
    expect(requiresChatPatch('1.19.1')).toBe(true)
    expect(requiresChatPatch('1.19.4')).toBe(true)
    expect(requiresChatPatch('1.20.1')).toBe(true)
    expect(requiresChatPatch('1.21.1')).toBe(true)
  })

  it('leaves future and custom version formats to the compatibility lookup', () => {
    expect(requiresChatPatch('26.2')).toBe(true)
    expect(requiresChatPatch('26w10a')).toBe(true)
    expect(requiresChatPatch('custom-profile')).toBe(true)
  })
})
