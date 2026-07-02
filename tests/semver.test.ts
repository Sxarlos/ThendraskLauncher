import { describe, it, expect } from 'vitest'
import { semverGt } from '../src/main/semver'

describe('semverGt', () => {
  it('compares simple versions', () => {
    expect(semverGt('1.0.1', '1.0.0')).toBe(true)
    expect(semverGt('1.0.0', '1.0.1')).toBe(false)
    expect(semverGt('1.0.0', '1.0.0')).toBe(false)
  })

  it('compares across segment magnitudes numerically, not lexically', () => {
    expect(semverGt('0.10.0', '0.9.0')).toBe(true)
    expect(semverGt('0.3.24', '0.3.3')).toBe(true)
  })

  it('handles a leading v prefix', () => {
    expect(semverGt('v1.2.0', '1.1.9')).toBe(true)
    expect(semverGt('1.2.0', 'v1.2.0')).toBe(false)
  })

  it('handles versions of different lengths', () => {
    expect(semverGt('1.2', '1.1.9')).toBe(true)
    expect(semverGt('1.2.0.1', '1.2.0')).toBe(true)
    expect(semverGt('1.2', '1.2.0')).toBe(false)
  })

  it('does not blow up on prerelease suffixes', () => {
    // Prerelease identifiers are ignored, not NaN-poisoned
    expect(semverGt('0.4.0-beta.1', '0.3.24')).toBe(true)
    expect(semverGt('0.4.0-beta.1', '0.4.0')).toBe(false)
    expect(semverGt('0.4.1', '0.4.0-beta.1')).toBe(true)
  })
})
