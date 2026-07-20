import { describe, expect, it } from 'vitest'
import { compatibleAddonVersion, detectGTNHVersion } from '../src/main/gregtechAddons'

describe('GregTech community addon compatibility', () => {
  it('detects a GTNH version from an imported instance name', () => {
    expect(detectGTNHVersion({ name: 'GTNH 2.8.4', packVersionId: undefined })).toBe('2.8.4')
    expect(detectGTNHVersion({ name: 'GT New Horizons - 2.7.4', packVersionId: undefined })).toBe('2.7.4')
    expect(detectGTNHVersion({ name: 'GTNH 2.9.0-beta-2', packVersionId: undefined })).toBe('2.9.0-beta-2')
  })

  it('accepts a semantic pack version id but not an unrelated id', () => {
    expect(detectGTNHVersion({ name: 'My pack', packVersionId: '2.8.4' })).toBe('2.8.4')
    expect(detectGTNHVersion({ name: 'My pack', packVersionId: '7cx9z' })).toBeUndefined()
  })

  it('pins the official GTNH 2.8.4 addon builds', () => {
    expect(compatibleAddonVersion('twist-space-technology', '2.8.4')).toBe('0.7.16')
    expect(compatibleAddonVersion('gt-not-leisure', '2.8.4')).toBe('0.2.6-hotfix1')
    expect(compatibleAddonVersion('123technology', '2.8.4')).toBe('2.1.8_5')
    expect(compatibleAddonVersion('nh-utilities', '2.8.4')).toBe('1.6.5')
    expect(compatibleAddonVersion('programmable-hatches', '2.8.4')).toBe('v0.1.3p55-beta')
  })

  it('does not guess when a pack version is unsupported', () => {
    expect(compatibleAddonVersion('twist-space-technology', '2.8.3')).toBeUndefined()
    expect(compatibleAddonVersion('gt-not-leisure', '2.6.0')).toBeUndefined()
  })
})
