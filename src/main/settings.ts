import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '@shared/types'
import { dataDir, readJson, writeJson } from './persist'

const execFileAsync = promisify(execFile)
const FILE = 'settings.json'

const DEFAULTS: AppSettings = {
  maxRamMb: 4096,
  gregTechHubEnabled: false,
  offlineAuthFallback: true
}

const SETTINGS_COPY_RE = /^settings(?:[._-].*)?$/i
const CURSEFORGE_KEY_RE = /"curseforgeApiKey"\s*:/gi

function replaceWithoutBackup(file: string, content: string): void {
  const temp = `${file}.curseforge-migration.tmp`
  try {
    writeFileSync(temp, content, { encoding: 'utf-8', flush: true })
    renameSync(temp, file)
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true })
  }
}

/**
 * Best-effort removal for a partially written or otherwise malformed settings
 * copy. Process spans from right to left so earlier offsets stay valid.
 */
function scrubMalformedCurseForgeKeys(text: string): string {
  const spans: Array<[number, number]> = []
  for (const match of text.matchAll(CURSEFORGE_KEY_RE)) {
    const keyStart = match.index
    let previous = keyStart - 1
    while (previous >= 0 && /\s/.test(text[previous])) previous--
    if (previous >= 0 && text[previous] !== '{' && text[previous] !== ',') continue

    let valueStart = keyStart + match[0].length
    while (valueStart < text.length && /\s/.test(text[valueStart])) valueStart++
    let valueEnd = valueStart
    if (text[valueStart] === '"') {
      valueEnd++
      let escaped = false
      while (valueEnd < text.length) {
        const char = text[valueEnd++]
        if (char === '"' && !escaped) break
        escaped = char === '\\' && !escaped
        if (char !== '\\') escaped = false
      }
    } else {
      while (valueEnd < text.length && !/[,}\r\n]/.test(text[valueEnd])) valueEnd++
    }

    let spanStart = keyStart
    let spanEnd = valueEnd
    if (previous >= 0 && text[previous] === ',') {
      spanStart = previous
    } else {
      while (spanEnd < text.length && /\s/.test(text[spanEnd])) spanEnd++
      if (text[spanEnd] === ',') spanEnd++
    }
    spans.push([spanStart, spanEnd])
  }

  let scrubbed = text
  for (const [start, end] of spans.reverse()) {
    scrubbed = scrubbed.slice(0, start) + scrubbed.slice(end)
  }
  return scrubbed
}

/**
 * Removes the retired plaintext CurseForge key from every settings copy in
 * userData. Files are replaced directly so the normal writer cannot create a
 * fresh backup containing the old secret.
 */
export function migrateStoredCurseForgeKeys(root = dataDir()): number {
  let removed = 0
  for (const name of readdirSync(root)) {
    if (!SETTINGS_COPY_RE.test(name)) continue
    const file = join(root, name)
    let text: string
    try {
      text = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      if (!Object.prototype.hasOwnProperty.call(parsed, 'curseforgeApiKey')) continue
      delete parsed.curseforgeApiKey
      replaceWithoutBackup(file, JSON.stringify(parsed, null, 2))
      removed++
    } catch {
      const scrubbed = scrubMalformedCurseForgeKeys(text)
      if (scrubbed === text) continue
      replaceWithoutBackup(file, scrubbed)
      removed++
    }
  }
  return removed
}

export function getSettings(): AppSettings {
  return { ...DEFAULTS, ...readJson<Partial<AppSettings>>(FILE, {}) }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  if ('curseforgeApiKey' in patch) delete (patch as Record<string, unknown>).curseforgeApiKey
  const next = { ...getSettings(), ...patch }
  delete (next as Record<string, unknown>).curseforgeApiKey
  writeJson(FILE, next)
  return next
}

/**
 * Resolve the Java executable to use: explicit setting first, else whatever is
 * on PATH. Returns the path and the detected version string (if any).
 */
export async function detectJava(): Promise<{ path: string; version?: string; ok: boolean }> {
  const path = getSettings().javaPath || 'java'
  try {
    // `java -version` prints to stderr.
    const { stderr } = await execFileAsync(path, ['-version'])
    const version = stderr.split('\n')[0]?.trim()
    return { path, version, ok: true }
  } catch {
    return { path, ok: false }
  }
}
