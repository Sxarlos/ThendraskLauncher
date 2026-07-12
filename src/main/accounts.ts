import { safeStorage } from 'electron'
import { Auth } from 'msmc'
import type { Minecraft } from 'msmc'
import { basename, extname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Account, MinecraftProfile, SavedSkin, SkinPreview } from '@shared/types'
import { dataDir, readJson, writeJson } from './persist'

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
  throw new Error(
    'Secure credential storage is unavailable. Configure your OS keychain/credential store, then sign in again.'
  )
}

function decrypt(enc: string): string {
  // Refuse legacy insecure records instead of continuing to expose the token.
  if (enc.startsWith('plain:')) {
    throw new Error('This saved session used insecure storage. Remove the account and sign in again.')
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

function isEmptyMinecraftLoginResponse(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const value = err as Record<string, unknown>
  const response = value.response as Record<string, unknown> | undefined
  return value.ts === 'error.auth.minecraft.login' && response?.size === 0
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

const MAX_SKIN_BYTES = 2 * 1024 * 1024
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const SKINS_FILE = 'skins.json'

interface SavedSkinRecord {
  id: string
  name: string
  variant: 'CLASSIC' | 'SLIM'
  fileName: string
  createdAt: string
}

/** Read and validate a user-selected Minecraft skin without trusting its extension. */
function readSkinPng(filePath: string): { data: Buffer; width: number; height: number } {
  if (typeof filePath !== 'string' || !filePath || extname(filePath).toLowerCase() !== '.png') {
    throw new Error('Choose a PNG skin file.')
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error('The selected skin file no longer exists.')
  }
  const size = statSync(filePath).size
  if (size <= 0 || size > MAX_SKIN_BYTES) {
    throw new Error('Skin files must be smaller than 2 MB.')
  }

  const data = readFileSync(filePath)
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE) || data.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('The selected file is not a valid PNG image.')
  }
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  if (width !== 64 || (height !== 64 && height !== 32)) {
    throw new Error('Minecraft skins must be 64×64 pixels (or the legacy 64×32 format).')
  }
  return { data, width, height }
}

/** Return a renderer-safe preview after validating the selected file. */
export function previewSkin(filePath: string): SkinPreview {
  const { data, width, height } = readSkinPng(filePath)
  return { dataUrl: `data:image/png;base64,${data.toString('base64')}`, width, height }
}

function skinLibraryDir(): string {
  const dir = join(dataDir(), 'skins')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function savedSkinRecords(): SavedSkinRecord[] {
  return readJson<SavedSkinRecord[]>(SKINS_FILE, [])
}

function savedSkinPath(record: SavedSkinRecord): string {
  if (basename(record.fileName) !== record.fileName || !/^[0-9a-f-]+\.png$/i.test(record.fileName)) {
    throw new Error('Invalid saved skin record.')
  }
  return join(skinLibraryDir(), record.fileName)
}

export function listSavedSkins(): SavedSkin[] {
  const records = savedSkinRecords()
  const valid = records.filter((record) => {
    try { return existsSync(savedSkinPath(record)) } catch { return false }
  })
  if (valid.length !== records.length) writeJson(SKINS_FILE, valid)
  return valid.map((record) => ({
    id: record.id,
    name: record.name,
    variant: record.variant,
    createdAt: record.createdAt,
    dataUrl: `data:image/png;base64,${readFileSync(savedSkinPath(record)).toString('base64')}`
  }))
}

export function saveSkin(filePath: string, variant: 'CLASSIC' | 'SLIM'): SavedSkin[] {
  if (variant !== 'CLASSIC' && variant !== 'SLIM') throw new Error('Invalid skin model.')
  const { data } = readSkinPng(filePath)
  const id = randomUUID()
  const fileName = `${id}.png`
  writeFileSync(join(skinLibraryDir(), fileName), data, { flag: 'wx' })
  const records = savedSkinRecords()
  records.push({
    id,
    fileName,
    name: basename(filePath, extname(filePath)).slice(0, 80) || 'Saved skin',
    variant,
    createdAt: new Date().toISOString()
  })
  writeJson(SKINS_FILE, records)
  return listSavedSkins()
}

export function deleteSavedSkin(id: string): SavedSkin[] {
  const records = savedSkinRecords()
  const record = records.find((item) => item.id === id)
  if (!record) return listSavedSkins()
  const file = savedSkinPath(record)
  if (existsSync(file)) unlinkSync(file)
  writeJson(SKINS_FILE, records.filter((item) => item.id !== id))
  return listSavedSkins()
}

/** Upload and activate a skin on the signed-in Minecraft account. */
export async function uploadSkin(
  filePath: string,
  variant: 'CLASSIC' | 'SLIM'
): Promise<MinecraftProfile> {
  if (variant !== 'CLASSIC' && variant !== 'SLIM') throw new Error('Invalid skin model.')
  const { data } = readSkinPng(filePath)
  return uploadSkinData(data, variant)
}

export async function uploadSavedSkin(id: string, variant: 'CLASSIC' | 'SLIM'): Promise<MinecraftProfile> {
  const record = savedSkinRecords().find((item) => item.id === id)
  if (!record) throw new Error('That saved skin no longer exists.')
  const { data } = readSkinPng(savedSkinPath(record))
  return uploadSkinData(data, variant)
}

async function uploadSkinData(data: Buffer, variant: 'CLASSIC' | 'SLIM'): Promise<MinecraftProfile> {
  if (variant !== 'CLASSIC' && variant !== 'SLIM') throw new Error('Invalid skin model.')
  const user = await getActiveMclcUser()
  const token = (user as unknown as Record<string, string>)['access_token']
  if (!token) throw new Error('No access token available.')

  const form = new FormData()
  form.append('variant', variant.toLowerCase())
  form.append('file', new Blob([new Uint8Array(data)], { type: 'image/png' }), 'skin.png')
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`Skin upload failed (${res.status})${detail ? `: ${detail}` : '.'}`)
  }
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

  let xbox: Awaited<ReturnType<Auth['refresh']>>
  try {
    const auth = new Auth()
    xbox = await auth.refresh(decrypt(active.tokenEnc))
  } catch (err) {
    const raw =
      err instanceof Error
        ? err.message
        : typeof err === 'object'
        ? JSON.stringify(err)
        : String(err)
    throw new Error(`SESSION_EXPIRED:${active.username} — session expired, please sign in again. (${raw})`, { cause: err })
  }

  // Persist the rotated refresh token immediately. A later Minecraft-services
  // outage must not discard a successful Microsoft token refresh.
  active.tokenEnc = encrypt(xbox.save())
  save(records)

  let mc
  try {
    mc = await xbox.getMinecraft()
  } catch (firstError) {
    // msmc occasionally receives an empty response from Minecraft Services.
    // This is transient and does not mean the Microsoft refresh token expired.
    if (!isEmptyMinecraftLoginResponse(firstError)) throw friendlyAuthError(firstError)
    await delay(750)
    try {
      mc = await xbox.getMinecraft()
    } catch (retryError) {
      throw friendlyAuthError(retryError)
    }
  }

  if (mc.profile) {
    active.id = mc.profile.id
    active.username = mc.profile.name
  }
  save(records)

  return mc.mclc(true)
}
