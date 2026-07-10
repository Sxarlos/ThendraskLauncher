import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
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
  const backup = `${file}.bak`
  for (const candidate of [file, backup]) {
    try {
      if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, 'utf-8')) as T
    } catch {
      // Try the backup before falling back to an empty/default value.
    }
  }
  return fallback
}

/** Atomically write JSON and retain the previous valid file as a recovery backup. */
export function writeJson(name: string, data: unknown): void {
  const file = join(dataDir(), name)
  const temp = `${file}.${process.pid}.tmp`
  const backup = `${file}.bak`
  try {
    writeFileSync(temp, JSON.stringify(data, null, 2), { encoding: 'utf-8', flush: true })
    if (existsSync(file)) copyFileSync(file, backup)
    renameSync(temp, file)
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true })
  }
}
