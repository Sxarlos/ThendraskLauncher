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

import { removePersistedCurseForgeScreenshots } from '../src/main/instances'

describe('CurseForge data minimisation', () => {
  afterEach(() => {
    const path = resolve(userData)
    if (userData && path.startsWith(resolve(tmpdir())) && existsSync(path)) {
      rmSync(path, { recursive: true, force: true })
    }
  })

  it('removes saved CurseForge galleries without changing other providers', () => {
    userData = mkdtempSync(join(tmpdir(), 'thendrask-cf-privacy-'))
    const instancesPath = join(userData, 'instances.json')
    writeFileSync(instancesPath, JSON.stringify([
      {
        id: 'curseforge-instance',
        name: 'CurseForge Pack',
        mcVersion: '1.20.1',
        loader: 'forge',
        source: 'curseforge',
        screenshotUrls: ['https://media.forgecdn.net/example.png']
      },
      {
        id: 'modrinth-instance',
        name: 'Modrinth Pack',
        mcVersion: '1.20.1',
        loader: 'fabric',
        source: 'modrinth',
        screenshotUrls: ['https://cdn.modrinth.com/example.png']
      }
    ]))

    expect(removePersistedCurseForgeScreenshots()).toBe(1)
    const saved = JSON.parse(readFileSync(instancesPath, 'utf-8'))
    expect(saved[0]).not.toHaveProperty('screenshotUrls')
    expect(saved[1].screenshotUrls).toEqual(['https://cdn.modrinth.com/example.png'])
    expect(removePersistedCurseForgeScreenshots()).toBe(0)
  })

  it('keeps the relay free of CurseForge response caching', () => {
    const source = readFileSync(join(process.cwd(), 'relay', 'index.js'), 'utf-8')
    expect(source).not.toContain('curseForgeCache')
    expect(source).not.toContain('X-Relay-Cache')
    expect(source).toContain("res.setHeader('Cache-Control', 'no-store')")
  })
})
