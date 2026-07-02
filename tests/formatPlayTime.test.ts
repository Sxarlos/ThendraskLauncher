import { describe, it, expect } from 'vitest'
import { formatPlayTime } from '../src/renderer/src/lib/formatPlayTime'

describe('formatPlayTime', () => {
  it('shows "< 1m" under a minute', () => {
    expect(formatPlayTime(0)).toBe('< 1m')
    expect(formatPlayTime(59_999)).toBe('< 1m')
  })

  it('shows minutes only under an hour', () => {
    expect(formatPlayTime(60_000)).toBe('1m')
    expect(formatPlayTime(59 * 60_000)).toBe('59m')
  })

  it('shows whole hours without minutes', () => {
    expect(formatPlayTime(60 * 60_000)).toBe('1h')
    expect(formatPlayTime(120 * 60_000)).toBe('2h')
  })

  it('shows hours and minutes', () => {
    expect(formatPlayTime(90 * 60_000)).toBe('1h 30m')
  })
})
