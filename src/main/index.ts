import { app, shell, BrowserWindow, ipcMain, nativeImage, dialog } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { listAccounts, loginInteractive, removeAccount, setActive, getMinecraftProfile, setActiveCape } from './accounts'
import {
  createInstance,
  listInstances,
  getInstance,
  removeInstance,
  updateInstance,
  instanceGameDir,
  type CreateInstanceInput
} from './instances'
import { isRunning, launchInstance, runningInstanceIds } from './launcher'
import { detectJava, getSettings, setSettings } from './settings'
import { getVersions } from './mojang'
import { listServers, addServer, removeServer, pingServer } from './servers'
import {
  searchModrinth,
  searchCurseForge,
  searchFtb,
  searchFtbLegacy,
  searchAtlauncher,
  searchTechnic,
  fetchModrinthScreenshots,
  fetchCurseForgeScreenshots,
  fetchFtbScreenshots,
  fetchModrinthVersions,
  fetchCurseForgeVersions,
  fetchFtbVersions,
  fetchAtlVersions,
  fetchTechnicVersions,
  fetchModrinthMods,
  fetchCurseFormMods,
  fetchFtbMods,
  getModrinthVersionDetails,
  getCurseForgeFileDetails,
  getFtbVersionDetails,
  fetchModrinthPackOverview,
  fetchCurseForgePackOverview,
  fetchFtbPackOverview,
  fetchAtlPackOverview,
  fetchTechnicPackOverview,
  fetchModrinthChangelog,
  fetchCurseForgeChangelog,
  fetchFtbChangelog
} from './browse'
import { importLocalPack, listLoaderVersions, installTechnicPack } from './modpack'
import { applyToAllInstances } from './chatmod'
import { detectAllJavas } from './java'
import { setCustomInstancesDir } from './persist'
import { startRelayRegistration, getOwnPresence } from './presence'
import { initDiscord, destroyDiscord } from './discord'
import { listFriends, addFriend, removeFriend, pollFriend, generateFriendCode } from './friends'
import { startUpdateChecker, checkForUpdate, openDownloadUrl, downloadUpdate, installAndRestart } from './updater'
import type { Friend } from '@shared/types'
import type { AppSettings, BrowseParams, ServerEntry } from '@shared/types'

function createWindow(): BrowserWindow {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    title: 'Ender Client',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

/** Small helper to register an async IPC handler with consistent error logging. */
function handle<T>(channel: string, fn: (...args: any[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipc:${channel}]`, message)
      throw new Error(message)
    }
  })
}

async function fetchAndStoreScreenshots(
  instanceId: string,
  source: 'modrinth' | 'curseforge' | 'ftb',
  externalId: string
): Promise<string[]> {
  try {
    let urls: string[]
    if (source === 'modrinth') {
      urls = await fetchModrinthScreenshots(externalId)
    } else if (source === 'curseforge') {
      urls = await fetchCurseForgeScreenshots(externalId)
    } else {
      urls = await fetchFtbScreenshots(externalId)
    }
    if (urls.length > 0) updateInstance(instanceId, { screenshotUrls: urls })
    return urls
  } catch (err) {
    console.error('[screenshots]', (err as Error).message)
    return []
  }
}

function registerIpcHandlers(): void {
  handle('app:version', () => app.getVersion())
  handle('shell:openExternal', (url: string) => shell.openExternal(url))

  // Accounts
  handle('accounts:list', () => listAccounts())
  handle('accounts:login', () => loginInteractive())
  handle('accounts:remove', (id: string) => removeAccount(id))
  handle('accounts:setActive', (id: string) => setActive(id))
  handle('profile:get', () => getMinecraftProfile())
  handle('profile:setCape', (capeId: string | null) => setActiveCape(capeId))

  // Instances
  handle('instances:list', () => listInstances())
  handle('instances:create', async (input: CreateInstanceInput) => {
    // Auto-populate packVersionId on first install so update tracking works
    if (input.externalId && input.source && input.source !== 'manual' && !input.packVersionId) {
      try {
        let versions
        if (input.source === 'modrinth') {
          versions = await fetchModrinthVersions(input.externalId)
        } else if (input.source === 'curseforge') {
          versions = await fetchCurseForgeVersions(input.externalId)
        } else if (input.source === 'ftb') {
          versions = await fetchFtbVersions(input.externalId)
        }
        if (versions?.length) input.packVersionId = versions[0].id
      } catch (_) {}
    }
    const inst = createInstance(input)
    if (input.externalId && input.source && input.source !== 'manual') {
      void fetchAndStoreScreenshots(inst.id, input.source as 'modrinth' | 'curseforge' | 'ftb', input.externalId)
    }
    return inst
  })
  handle('instances:remove', (id: string) => removeInstance(id))
  handle('instances:update', (id: string, patch: Partial<import('@shared/types').Instance>) => updateInstance(id, patch))
  handle('instances:running', () => runningInstanceIds())
  handle('instances:isRunning', (id: string) => isRunning(id))
  handle('instances:fetchScreenshots', (id: string) => {
    const inst = listInstances().find((i) => i.id === id)
    if (!inst?.externalId || !inst.source || inst.source === 'manual') return null
    return fetchAndStoreScreenshots(id, inst.source as 'modrinth' | 'curseforge' | 'ftb', inst.externalId)
  })

  // Launch
  handle('launch:start', (instanceId: string) => launchInstance(instanceId))

  // Mojang versions
  handle('mojang:versions', () => getVersions())

  // Settings
  handle('settings:get', () => getSettings())
  handle('settings:set', (patch: Partial<AppSettings>) => {
    const next = setSettings(patch)
    if ('instancesDir' in patch) setCustomInstancesDir(next.instancesDir ?? null)
    if ('discordRpc' in patch || 'discordClientId' in patch) {
      initDiscord(next.discordClientId, !!next.discordRpc)
    }
    return next
  })
  handle('settings:detectJava', () => detectJava())
  handle('settings:applyNoChatMod', (enable: boolean) => applyToAllInstances(enable))

  // Java detection
  handle('java:list', () => detectAllJavas())

  // Directory picker
  handle('dialog:pickDir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Single file picker
  handle('dialog:pickFile', async (_: unknown, filters: Electron.FileFilter[] = []) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Mod file picker — returns selected .jar paths
  handle('dialog:pickModFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Mod JARs', extensions: ['jar'] }]
    })
    return result.canceled ? [] : result.filePaths
  })

  // Open instance game directory in file explorer
  handle('instance:openDir', (instanceId: string) => {
    shell.openPath(instanceGameDir(instanceId))
  })

  // Local mod management
  handle('instance:addMod', (instanceId: string, sourcePath: string) => {
    const modsDir = join(instanceGameDir(instanceId), 'mods')
    mkdirSync(modsDir, { recursive: true })
    const dest = join(modsDir, basename(sourcePath))
    copyFileSync(sourcePath, dest)
    return basename(sourcePath)
  })

  handle('instance:listLocalMods', (instanceId: string) => {
    const modsDir = join(instanceGameDir(instanceId), 'mods')
    if (!existsSync(modsDir)) return []
    return readdirSync(modsDir)
      .filter((f) => f.endsWith('.jar'))
      .map((f) => {
        const size = statSync(join(modsDir, f)).size
        return { name: f, size }
      })
  })

  handle('instance:removeMod', (instanceId: string, fileName: string) => {
    const modPath = join(instanceGameDir(instanceId), 'mods', fileName)
    if (existsSync(modPath)) unlinkSync(modPath)
  })

  // Friends & presence
  handle('friends:list', () => listFriends())
  handle('friends:add', (data: Omit<Friend, 'id'>) => addFriend(data))
  handle('friends:remove', (id: string) => removeFriend(id))
  handle('friends:poll', (code: string) => pollFriend(code))
  handle('presence:own', () => getOwnPresence())

  // Browse
  handle('browse:modrinth', (params: BrowseParams) => searchModrinth(params))
  handle('browse:curseforge', (params: BrowseParams) => searchCurseForge(params))
  handle('browse:ftb', (params: BrowseParams) => searchFtb(params))
  handle('browse:ftb-legacy', (params: BrowseParams, category: string) => searchFtbLegacy(params, category))
  handle('browse:atlauncher', (params: BrowseParams, category: string) => searchAtlauncher(params, category))
  handle('browse:technic', (params: BrowseParams) => searchTechnic(params))

  // Modpack detail (versions, mods, switch)
  handle('modpack:versions', async (instanceId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst?.externalId || inst.source === 'manual' || !inst.source) return []
    if (inst.source === 'modrinth') return fetchModrinthVersions(inst.externalId)
    if (inst.source === 'ftb' || inst.source === 'ftb-legacy') return fetchFtbVersions(inst.externalId)
    if (inst.source === 'atlauncher') return fetchAtlVersions(inst.externalId)
    if (inst.source === 'technic') return fetchTechnicVersions(inst.externalId)
    return fetchCurseForgeVersions(inst.externalId)
  })

  handle('modpack:mods', async (instanceId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst?.externalId || inst.source === 'manual' || !inst.source) return []
    if (inst.source === 'modrinth') return fetchModrinthMods(inst.externalId, inst.packVersionId)
    if (inst.source === 'ftb' || inst.source === 'ftb-legacy') return fetchFtbMods(inst.externalId, inst.packVersionId)
    if (inst.source === 'atlauncher' || inst.source === 'technic') return []
    return fetchCurseFormMods(inst.externalId, inst.packVersionId)
  })

  handle('modpack:changelog', async (instanceId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst?.externalId || inst.source === 'manual' || !inst.source) return []
    if (inst.source === 'modrinth') return fetchModrinthChangelog(inst.externalId)
    if (inst.source === 'ftb' || inst.source === 'ftb-legacy') return fetchFtbChangelog(inst.externalId)
    if (inst.source === 'atlauncher' || inst.source === 'technic') return []
    return fetchCurseForgeChangelog(inst.externalId)
  })

  handle('modpack:overview', async (instanceId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst?.externalId || inst.source === 'manual' || !inst.source) return null
    if (inst.source === 'modrinth') return fetchModrinthPackOverview(inst.externalId)
    if (inst.source === 'ftb' || inst.source === 'ftb-legacy') return fetchFtbPackOverview(inst.externalId)
    if (inst.source === 'atlauncher') return fetchAtlPackOverview(inst.externalId)
    if (inst.source === 'technic') return fetchTechnicPackOverview(inst.externalId)
    return fetchCurseForgePackOverview(inst.externalId)
  })

  handle('modpack:switchVersion', async (instanceId: string, versionId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst) throw new Error('Instance not found')

    let mcVersion = inst.mcVersion
    if (inst.source === 'modrinth') {
      const details = await getModrinthVersionDetails(versionId)
      if (details.mcVersion) mcVersion = details.mcVersion
    } else if (inst.source === 'curseforge' && inst.externalId) {
      const details = await getCurseForgeFileDetails(inst.externalId, versionId)
      if (details.mcVersion) mcVersion = details.mcVersion
    } else if ((inst.source === 'ftb' || inst.source === 'ftb-legacy') && inst.externalId) {
      const details = await getFtbVersionDetails(inst.externalId, versionId)
      if (details.mcVersion) mcVersion = details.mcVersion
    }
    // ATLauncher: versionId is the version string; mcVersion stays as-is

    return updateInstance(instanceId, { mcVersion, packVersionId: versionId })
  })

  // Loader version listing (for the New Instance modal)
  handle('loader:versions', (loader: string, mcVersion: string) => listLoaderVersions(loader, mcVersion))

  // Local pack import (.mrpack or CurseForge zip)
  handle('modpack:importFile', async (filePath: string) => {
    const tempInst = createInstance({
      name: 'Importing…',
      mcVersion: '',
      loader: 'vanilla',
      source: 'manual'
    })

    try {
      const result = await importLocalPack(
        tempInst.id,
        filePath,
        () => {} // no per-file progress needed for now
      )
      return updateInstance(tempInst.id, {
        name: result.name,
        mcVersion: result.mcVersion,
        loader: result.marker.loaderType as import('@shared/types').LoaderType,
        loaderVersion: result.marker.loaderVersion
      })
    } catch (err) {
      removeInstance(tempInst.id)
      throw err
    }
  })

  // Servers
  handle('servers:list', () => listServers())
  handle('servers:add', (data: Omit<ServerEntry, 'id'>) => addServer(data))
  handle('servers:remove', (id: string) => removeServer(id))
  handle('servers:ping', (host: string, port?: number) => pingServer(host, port))

  // Updater
  handle('update:check', () => checkForUpdate())
  handle('update:openDownload', (url: string) => openDownloadUrl(url))
  handle('update:download', (url: string) => downloadUpdate(url))
  handle('update:install', (path: string) => installAndRestart(path))
}

app.whenReady().then(() => {
  // Apply custom instances directory before any instance operations
  let { instancesDir: customDir, friendCode, discordRpc, discordClientId } = getSettings()
  if (customDir) setCustomInstancesDir(customDir)
  initDiscord(discordClientId, !!discordRpc)

  // Auto-generate a friend code for this user on first run
  if (!friendCode) setSettings({ friendCode: generateFriendCode() })

  // Auto-apply the default relay URL if none is saved yet
  const DEFAULT_RELAY_URL = 'https://relay.sxarlos.store'
  if ((DEFAULT_RELAY_URL as string) !== 'PASTE_YOUR_RELAY_URL_HERE') {
    const { relayUrl } = getSettings()
    if (!relayUrl) setSettings({ relayUrl: DEFAULT_RELAY_URL })
  }

  startRelayRegistration()
  registerIpcHandlers()
  createWindow()
  startUpdateChecker()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  destroyDiscord()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
