import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

let userData = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => userData
  }
}))

import { migrateStoredCurseForgeKeys } from '../src/main/settings'

describe('CurseForge settings migration', () => {
  afterEach(() => {
    const path = resolve(userData)
    if (userData && path.startsWith(resolve(tmpdir())) && existsSync(path)) {
      rmSync(path, { recursive: true, force: true })
    }
  })

  it('removes keys from primary, backup, temporary, and legacy settings copies', () => {
    userData = mkdtempSync(join(tmpdir(), 'thendrask-settings-'))
    const copies = [
      'settings.json',
      'settings.json.bak',
      'settings.bak',
      'settings.json.123.tmp',
      'settings-legacy.json'
    ]
    for (const name of copies) {
      writeFileSync(
        join(userData, name),
        JSON.stringify({ curseforgeApiKey: 'plaintext-secret', maxRamMb: 6144 })
      )
    }

    expect(migrateStoredCurseForgeKeys(userData)).toBe(copies.length)
    for (const name of copies) {
      const text = readFileSync(join(userData, name), 'utf-8')
      expect(text).not.toContain('plaintext-secret')
      expect(JSON.parse(text)).toEqual({ maxRamMb: 6144 })
    }
    expect(existsSync(join(userData, 'settings.json.bak.bak'))).toBe(false)
    expect(migrateStoredCurseForgeKeys(userData)).toBe(0)
  })

  it('scrubs a key from malformed and partially written settings copies', () => {
    userData = mkdtempSync(join(tmpdir(), 'thendrask-settings-'))
    const malformed = join(userData, 'settings.json.crash.tmp')
    const fakeKey = '$2a$10$THIS_IS_AN_OBVIOUSLY_FAKE_CURSEFORGE_KEY'
    writeFileSync(
      malformed,
      `{\n  "maxRamMb": 8192,\n  "curseforgeApiKey": "${fakeKey}`
    )

    expect(migrateStoredCurseForgeKeys(userData)).toBe(1)
    const text = readFileSync(malformed, 'utf-8')
    expect(text).not.toContain('curseforgeApiKey')
    expect(text).not.toContain(fakeKey)
    expect(text).toContain('"maxRamMb": 8192')
    expect(migrateStoredCurseForgeKeys(userData)).toBe(0)
  })
})
