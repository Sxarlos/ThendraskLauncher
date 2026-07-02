import { safeStorage } from 'electron'
import { Auth } from 'msmc'
import type { Minecraft } from 'msmc'
import type { Account, MinecraftProfile } from '@shared/types'
import { readJson, writeJson } from './persist'

/** Launcher-ready user object as produced by msmc's `Minecraft.mclc()`. */
export type MclcUser = ReturnType<Minecraft['mclc']>

const FILE = 'accounts.json'

interface AccountRecord {
  id: string // Minecraft profile UUID
  username: string
  /** msmc refresh token, encrypted with the OS keychain and base64-encoded. */
  tokenEnc: string
  active: boolean
}

function load(): AccountRecord[] {
  return readJson<AccountRecord[]>(FILE, [])
}

function save(records: AccountRecord[]): void {
  writeJson(FILE, records)
}

function encrypt(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64')
  }
  // Fallback (e.g. no keychain): store reversibly but clearly marked.
  return 'plain:' + Buffer.from(token, 'utf-8').toString('base64')
}

function decrypt(enc: string): string {
  if (enc.startsWith('plain:')) {
    return Buffer.from(enc.slice('plain:'.length), 'base64').toString('utf-8')
  }
  return safeStorage.decryptString(Buffer.from(enc, 'base64'))
}

/** Public view of accounts (never exposes tokens to the renderer). */
export function listAccounts(): Account[] {
  return load().map((r) => ({ id: r.id, username: r.username, active: r.active }))
}

/**
 * Open the Microsoft login window and persist the resulting account.
 * Returns the updated account list. Throws on cancel/failure.
 */
/** Translate msmc's raw lexicon error codes into friendly, user-facing messages.
 *  msmc throws plain objects (not Error instances), so we check the `ts` field first. */
function friendlyAuthError(err: unknown): Error {
  // msmc throws plain objects with a typed `ts` field
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>
    const ts = typeof e.ts === 'string' ? e.ts : ''
    const resp = e.response as Record<string, unknown> | undefined

    if (ts.includes('cancel') || ts.includes('closed') || ts.includes('gui')) {
      return new Error('Login was cancelled.')
    }
    if (ts === 'error.auth.minecraft.login') {
      const size = typeof resp?.size === 'number' ? resp.size : -1
      if (size === 0) {
        return new Error(
          'Minecraft auth servers returned an empty response — this is usually a temporary Microsoft/Mojang outage or rate-limit. Wait a few minutes and try again.'
        )
      }
      return new Error(
        'Minecraft authentication failed. Make sure this Microsoft account owns Minecraft: Java Edition.'
      )
    }
    if (ts.includes('xsts') || ts.includes('xbox')) {
      return new Error('Xbox authentication failed. Check that your Microsoft account has an Xbox profile.')
    }
    if (ts.includes('child') || ts.includes('xboxAccount')) {
      return new Error('This Microsoft account has no Xbox profile, or is a child account that needs adult consent.')
    }
    // Fallback: show the serialised object so it's at least readable
    return new Error(`Sign-in failed: ${JSON.stringify(e)}`)
  }

  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes('gui.closed') || raw.includes('cancel')) return new Error('Login was cancelled.')
  if (raw.includes('xboxAccount') || raw.includes('child')) {
    return new Error('This Microsoft account has no Xbox profile, or is a child account that needs adult consent.')
  }
  if (raw.includes('noProfile') || raw.includes('profile')) {
    return new Error('This account does not own Minecraft: Java Edition.')
  }
  return new Error(`Sign-in failed: ${raw}`)
}

export async function loginInteractive(): Promise<Account[]> {
  let refreshToken: string
  let profile: { id: string; name: string } | undefined
  try {
    const auth = new Auth('select_account')
    const xbox = await auth.launch('electron')
    const mc = await xbox.getMinecraft()
    refreshToken = xbox.save()
    profile = mc.profile
  } catch (err) {
    throw friendlyAuthError(err)
  }
  if (!profile) throw new Error('This account does not own Minecraft: Java Edition.')

  const records = load()
  const existing = records.find((r) => r.id === profile.id)
  if (existing) {
    existing.username = profile.name
    existing.tokenEnc = encrypt(refreshToken)
  } else {
    records.push({
      id: profile.id,
      username: profile.name,
      tokenEnc: encrypt(refreshToken),
      active: false
    })
  }
  // Make the just-added/updated account active.
  records.forEach((r) => (r.active = r.id === profile.id))
  save(records)
  return listAccounts()
}

export function removeAccount(id: string): Account[] {
  const records = load().filter((r) => r.id !== id)
  // If we removed the active account, promote the first remaining one.
  if (records.length && !records.some((r) => r.active)) records[0].active = true
  save(records)
  return listAccounts()
}

export function setActive(id: string): Account[] {
  const records = load()
  records.forEach((r) => (r.active = r.id === id))
  save(records)
  return listAccounts()
}

/** Fetches the full Minecraft profile (skins + capes) for the active account. */
export async function getMinecraftProfile(): Promise<MinecraftProfile> {
  const user = await getActiveMclcUser()
  // MclcUser always has access_token — cast to reach it
  const token = (user as unknown as Record<string, string>)['access_token']
  if (!token) throw new Error('No access token available.')

  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Minecraft profile API returned ${res.status}`)
  return res.json() as Promise<MinecraftProfile>
}

/** Equip a cape by ID, or pass null to unequip the current cape. */
export async function setActiveCape(capeId: string | null): Promise<void> {
  const user = await getActiveMclcUser()
  const token = (user as unknown as Record<string, string>)['access_token']
  if (!token) throw new Error('No access token available.')

  if (capeId === null) {
    const res = await fetch(
      'https://api.minecraftservices.com/minecraft/profile/capes/active',
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok && res.status !== 204) throw new Error(`Cape API returned ${res.status}`)
  } else {
    const res = await fetch(
      'https://api.minecraftservices.com/minecraft/profile/capes/active',
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ capeId })
      }
    )
    if (!res.ok) throw new Error(`Cape API returned ${res.status}`)
  }
}

/**
 * Refresh the active account's token and return a launcher-ready user object.
 * Persists the rotated refresh token. Throws if no active account or refresh fails.
 */
export async function getActiveMclcUser(): Promise<MclcUser> {
  const records = load()
  const active = records.find((r) => r.active) ?? records[0]
  if (!active) throw new Error('No Minecraft account is signed in.')

  let mc
  try {
    const auth = new Auth()
    const xbox = await auth.refresh(decrypt(active.tokenEnc))
    mc = await xbox.getMinecraft()
    // Persist the rotated refresh token so the session stays valid.
    active.tokenEnc = encrypt(xbox.save())
  } catch (err) {
    const raw =
      err instanceof Error
        ? err.message
        : typeof err === 'object'
        ? JSON.stringify(err)
        : String(err)
    throw new Error(`SESSION_EXPIRED:${active.username} — session expired, please sign in again. (${raw})`, { cause: err })
  }

  if (mc.profile) {
    active.id = mc.profile.id
    active.username = mc.profile.name
  }
  save(records)

  return mc.mclc(true)
}
