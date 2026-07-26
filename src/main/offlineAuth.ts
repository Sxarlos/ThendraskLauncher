export interface SavedOfflineIdentity {
  id: string
  username: string
}

export interface OfflineAuthorization {
  access_token: string
  client_token: string
  uuid: string
  name: string
  user_properties: string
  meta: {
    type: 'legacy'
  }
}

export interface LaunchAuthorizationResult<T> {
  authorization: T | OfflineAuthorization
  offline: boolean
  reason?: string
}

/**
 * Build the launcher authorization used when Microsoft/Minecraft auth is
 * unavailable. The identity must come from a previously authenticated saved
 * account; callers must never accept an arbitrary username here.
 */
export function createOfflineAuthorization(account: SavedOfflineIdentity): OfflineAuthorization {
  if (!account.id.trim() || !account.username.trim()) {
    throw new Error('The saved Minecraft account is missing its offline identity.')
  }

  return {
    access_token: 'offline',
    client_token: 'offline',
    uuid: account.id,
    name: account.username,
    user_properties: '{}',
    meta: { type: 'legacy' }
  }
}

export async function resolveLaunchAuthorization<T>(
  getOnlineAuthorization: () => Promise<T>,
  savedIdentity: SavedOfflineIdentity | undefined,
  allowOffline: boolean
): Promise<LaunchAuthorizationResult<T>> {
  try {
    return { authorization: await getOnlineAuthorization(), offline: false }
  } catch (err) {
    if (!allowOffline || !savedIdentity) throw err
    return {
      authorization: createOfflineAuthorization(savedIdentity),
      offline: true,
      reason: err instanceof Error ? err.message : String(err)
    }
  }
}
