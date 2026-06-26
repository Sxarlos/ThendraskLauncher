import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Root directory for all app data (per-user, OS-appropriate). */
export function dataDir(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

let _customInstancesDir: string | null = null

/** Override the default instances directory (call at startup). */
export function setCustomInstancesDir(dir: string | null): void {
  _customInstancesDir = dir
}

/** Directory that holds all game instances. */
export function instancesDir(): string {
  const dir = _customInstancesDir ?? join(dataDir(), 'instances')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Read a JSON file under the data dir, returning `fallback` if missing/corrupt. */
export function readJson<T>(name: string, fallback: T): T {
  const file = join(dataDir(), name)
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

/** Write a JSON file under the data dir (pretty-printed). */
export function writeJson(name: string, data: unknown): void {
  writeFileSync(join(dataDir(), name), JSON.stringify(data, null, 2), 'utf-8')
}
