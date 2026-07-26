import { describe, expect, it } from 'vitest'
import {
  createOfflineAuthorization,
  resolveLaunchAuthorization
} from '../src/main/offlineAuth'

describe('offline launch authorization', () => {
  it('preserves the last verified Minecraft identity', () => {
    expect(createOfflineAuthorization({
      id: '1234567890abcdef1234567890abcdef',
      username: 'TestPlayer'
    })).toEqual({
      access_token: 'offline',
      client_token: 'offline',
      uuid: '1234567890abcdef1234567890abcdef',
      name: 'TestPlayer',
      user_properties: '{}',
      meta: { type: 'legacy' }
    })
  })

  it('rejects incomplete saved identities', () => {
    expect(() => createOfflineAuthorization({ id: '', username: 'TestPlayer' })).toThrow(
      'missing its offline identity'
    )
    expect(() => createOfflineAuthorization({ id: 'abc', username: ' ' })).toThrow(
      'missing its offline identity'
    )
  })

  it('uses online authorization when authentication succeeds', async () => {
    const online = { access_token: 'real-token' }
    await expect(resolveLaunchAuthorization(
      async () => online,
      { id: 'abc', username: 'TestPlayer' },
      true
    )).resolves.toEqual({ authorization: online, offline: false })
  })

  it('falls back only when enabled and a verified identity exists', async () => {
    const failure = new Error('authentication service unavailable')
    const getOnline = async (): Promise<never> => { throw failure }
    const identity = { id: 'abc', username: 'TestPlayer' }

    await expect(resolveLaunchAuthorization(getOnline, identity, true)).resolves.toMatchObject({
      offline: true,
      authorization: { uuid: 'abc', name: 'TestPlayer' },
      reason: failure.message
    })
    await expect(resolveLaunchAuthorization(getOnline, identity, false)).rejects.toBe(failure)
    await expect(resolveLaunchAuthorization(getOnline, undefined, true)).rejects.toBe(failure)
  })
})
