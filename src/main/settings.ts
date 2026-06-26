import { execFile } from 'child_process'
import { promisify } from 'util'
import type { AppSettings } from '@shared/types'
import { readJson, writeJson } from './persist'

const execFileAsync = promisify(execFile)
const FILE = 'settings.json'

const DEFAULTS: AppSettings = {
  maxRamMb: 4096
}

export function getSettings(): AppSettings {
  return { ...DEFAULTS, ...readJson<Partial<AppSettings>>(FILE, {}) }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
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
