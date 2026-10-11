import { EventEmitter } from 'events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ game: '', instance: {} as any, launch: vi.fn(), send: vi.fn() }))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ webContents: { send: state.send } }] } }))
vi.mock('minecraft-launcher-core', () => ({ Client: class extends EventEmitter { launch = state.launch } }))
vi.mock('../src/main/instances', () => ({
  getInstance: () => state.instance, instanceGameDir: () => state.game,
  updateInstance: (_id: string, patch: any) => Object.assign(state.instance, patch), markPlayed: vi.fn(), addPlayTime: vi.fn()
}))
vi.mock('../src/main/accounts', () => ({ getLaunchAccount: async () => ({ authorization: { name: 'test', uuid: 'test', access_token: 'test' } }) }))
vi.mock('../src/main/settings', () => ({ getSettings: () => ({ maxRamMb: 2048 }) }))
vi.mock('../src/main/java', () => ({ ensureJava: async () => 'java', resolveRequiredJavaMajor: async () => 21, detectNeoforgeJavaMajor: () => null }))
vi.mock('../src/main/chatmod', () => ({ ensureChatMod: vi.fn() }))
vi.mock('../src/main/gameoptions', () => ({ writeDefaultOptions: vi.fn(), applyControls: vi.fn() }))
vi.mock('../src/main/mojang', () => ({ getVersions: async () => [] }))
vi.mock('../src/main/discord', () => ({ setPlaying: vi.fn(), setIdle: vi.fn() }))
vi.mock('../src/main/snapshots', () => ({ createSnapshot: vi.fn(), restoreSnapshot: vi.fn() }))
vi.mock('../src/main/shaders', () => ({ autoInstallShader: vi.fn() }))
vi.mock('../src/main/modpack', () => ({
  readMarker: vi.fn(), installMrpack: vi.fn(), installCfPack: vi.fn(),
  resolveFabricVersion: vi.fn(), resolveQuiltVersion: vi.fn(), resolveForgeVersion: vi.fn(), resolveNeoforgeVersion: vi.fn(),
  installFabricLoader: vi.fn(), installQuiltLoader: vi.fn(), installForgeLoader: vi.fn(), installNeoforgeProfile: vi.fn(), readNeoforgeJvmArgs: vi.fn()
}))

import { isRunning, launchInstance } from '../src/main/launcher'
import * as packs from '../src/main/modpack'

beforeEach(() => {
  vi.clearAllMocks()
  state.game = mkdtempSync(join(tmpdir(), 'thendrask-launch-safety-'))
  state.instance = { id: state.game, mcVersion: '1.21.1', loader: 'fabric', name: 'Test', source: 'manual' }
  state.launch.mockResolvedValue({})
})
afterEach(() => { rmSync(state.game, { recursive: true, force: true }) })

describe('launch safety', () => {
  it.each(['fabric', 'quilt', 'forge', 'neoforge'])('does not start vanilla when %s resolution fails', async (loader) => {
    state.instance.loader = loader
    await expect(launchInstance(state.game)).rejects.toThrow(/resolve/)
    expect(state.launch).not.toHaveBeenCalled()
    expect(isRunning(state.game)).toBe(false)
    expect(state.send).toHaveBeenCalledWith('launch:progress', expect.objectContaining({ state: 'error' }))
  })

  it.each([
    ['fabric', 'installFabricLoader'], ['quilt', 'installQuiltLoader'],
    ['forge', 'installForgeLoader'], ['neoforge', 'installNeoforgeProfile']
  ] as const)('does not start vanilla when %s installation fails', async (loader, installer) => {
    state.instance.loader = loader
    state.instance.loaderVersion = 'test-version'
    vi.mocked(packs[installer]).mockRejectedValueOnce(new Error('download failed'))
    await expect(launchInstance(state.game)).rejects.toThrow(/download failed/)
    expect(state.launch).not.toHaveBeenCalled()
    expect(isRunning(state.game)).toBe(false)
  })

  it('recreates the generated Prism profile after restoring a portable backup', async () => {
    const versionJson = { id: 'thendrask-prism', mainClass: 'example.Main', libraries: [] }
    writeFileSync(join(state.game, '.thendrask-prism.json'), JSON.stringify({
      versionId: 'thendrask-prism', javaMajor: 21, jvmArgs: [], versionJson
    }))
    // No versions directory, exactly as after portable backup import.
    await launchInstance(state.game)
    const path = join(state.game, 'versions', 'thendrask-prism', 'thendrask-prism.json')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(versionJson)
    expect(state.launch).toHaveBeenCalledWith(expect.objectContaining({ overrides: { versionJson: path } }))
  })

  it('launches with the installed archive Minecraft version instead of stale instance metadata', async () => {
    state.instance.source = 'modrinth'
    state.instance.externalId = 'pack'
    state.instance.packVersionId = 'new'
    state.instance.mcVersion = '1.9'
    vi.mocked(packs.readMarker).mockReturnValueOnce(null)
    vi.mocked(packs.installMrpack).mockResolvedValueOnce({ packVersionId: 'new', mcVersion: '1.21.1', loaderType: 'vanilla' })
    await launchInstance(state.game)
    expect(state.launch).toHaveBeenCalledWith(expect.objectContaining({ version: expect.objectContaining({ number: '1.21.1' }) }))
  })
  it('rejects traversal in a restored Prism profile before writing files', async () => {
    writeFileSync(join(state.game, '.thendrask-prism.json'), JSON.stringify({ versionId: '../escape', versionJson: {} }))
    await expect(launchInstance(state.game)).rejects.toThrow(/Invalid Prism version ID/)
    expect(state.launch).not.toHaveBeenCalled()
  })

})
