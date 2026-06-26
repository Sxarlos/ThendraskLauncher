import { app, shell, BrowserWindow, ipcMain, nativeImage, dialog } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { listAccounts, loginInteractive, removeAccount, setActive, getMinecraftProfile, setActiveCape } from './accounts'
import {
  createInstance,
  listInstances,
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
  fetchModrinthScreenshots,
  fetchCurseForgeScreenshots,
  fetchModrinthVersions,
  fetchCurseForgeVersions,
  fetchModrinthMods,
  fetchCurseFormMods,
  getModrinthVersionDetails,
  getCurseForgeFileDetails,
  fetchModrinthPackOverview,
  fetchCurseForgePackOverview,
  fetchModrinthChangelog,
  fetchCurseForgeChangelog
} from './browse'
import { applyToAllInstances } from './chatmod'
import { detectAllJavas } from './java'
import { setCustomInstancesDir } from './persist'
import { startRelayRegistration, getOwnPresence } from './presence'
import { initDiscord, destroyDiscord } from './discord'
import { listFriends, addFriend, removeFriend, pollFriend, generateFriendCode } from './friends'
import { startUpdateChecker, checkForUpdate, openDownloadUrl } from './updater'
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
  source: 'modrinth' | 'curseforge',
  externalId: string
): Promise<string[]> {
  try {
    const urls =
      source === 'modrinth'
        ? await fetchModrinthScreenshots(externalId)
        : await fetchCurseForgeScreenshots(externalId)
    if (urls.length > 0) updateInstance(instanceId, { screenshotUrls: urls })
    return urls
  } catch (err) {
    console.error('[screenshots]', (err as Error).message)
    return []
  }
}

function registerIpcHandlers(): void {
  handle('app:version', () => app.getVersion())

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
        const versions =
          input.source === 'modrinth'
            ? await fetchModrinthVersions(input.externalId)
            : await fetchCurseForgeVersions(input.externalId)
        if (versions.length > 0) input.packVersionId = versions[0].id
      } catch (_) {}
    }
    const inst = createInstance(input)
    if (input.externalId && input.source && input.source !== 'manual') {
      void fetchAndStoreScreenshots(inst.id, input.source, input.externalId)
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
    return fetchAndStoreScreenshots(id, inst.source, inst.externalId)
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

  // Modpack detail (versions, mods, switch)
  handle('modpack:versions', async (instanceId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst?.externalId || inst.source === 'manual' || !inst.source) return []
    return inst.source === 'modrinth'
      ? fetchModrinthVersions(inst.externalId)
      : fetchCurseForgeVersions(inst.externalId)
  })

  handle('modpack:mods', async (instanceId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst?.externalId || inst.source === 'manual' || !inst.source) return []
    return inst.source === 'modrinth'
      ? fetchModrinthMods(inst.externalId, inst.packVersionId)
      : fetchCurseFormMods(inst.externalId, inst.packVersionId)
  })

  handle('modpack:changelog', async (instanceId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst?.externalId || inst.source === 'manual' || !inst.source) return []
    return inst.source === 'modrinth'
      ? fetchModrinthChangelog(inst.externalId)
      : fetchCurseForgeChangelog(inst.externalId)
  })

  handle('modpack:overview', async (instanceId: string) => {
    const inst = listInstances().find((i) => i.id === instanceId)
    if (!inst?.externalId || inst.source === 'manual' || !inst.source) return null
    return inst.source === 'modrinth'
      ? fetchModrinthPackOverview(inst.externalId)
      : fetchCurseForgePackOverview(inst.externalId)
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
    }

    return updateInstance(instanceId, { mcVersion, packVersionId: versionId })
  })

  // Servers
  handle('servers:list', () => listServers())
  handle('servers:add', (data: Omit<ServerEntry, 'id'>) => addServer(data))
  handle('servers:remove', (id: string) => removeServer(id))
  handle('servers:ping', (host: string, port?: number) => pingServer(host, port))

  // Updater
  handle('update:check', () => checkForUpdate())
  handle('update:openDownload', (url: string) => openDownloadUrl(url))
}

app.whenReady().then(() => {
  // Apply custom instances directory before any instance operations
  let { instancesDir: customDir, friendCode, discordRpc, discordClientId } = getSettings()
  if (customDir) setCustomInstancesDir(customDir)
  initDiscord(discordClientId, !!discordRpc)

  // Auto-generate a friend code for this user on first run
  if (!friendCode) setSettings({ friendCode: generateFriendCode() })

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
