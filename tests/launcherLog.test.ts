import { describe, expect, it } from 'vitest'
import { sanitizeMclcDebug } from '../src/main/launcherLog'

describe('launcher debug logging', () => {
  it('redacts account access tokens from MCLC launch arguments', () => {
    expect(sanitizeMclcDebug(
      '[MCLC]: Launching with arguments -Xmx4G --accessToken secret.jwt.value --userType msa'
    )).toBe(
      '[MCLC]: Launching with arguments -Xmx4G --accessToken [redacted] --userType msa'
    )
  })
})
