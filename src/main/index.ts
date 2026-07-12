// Allow explicit GC calls (global.gc) used in idle mode
app.commandLine.appendSwitch('js-flags', '--expose-gc')

import { app, shell, BrowserWindow, ipcMain, nativeImage, dialog, Tray, Menu } from 'electron'
import { join, basename } from 'path'
import { existsSync, mkdirSync, copyFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs'
import { listAccounts, loginInteractive, removeAccount, setActive, getMinecraftProfile, setActiveCape, previewSkin, uploadSkin, listSavedSkins, saveSkin, deleteSavedSkin, uploadSavedSkin } from './accounts'
import {
  createInstance,
  listInstances,
  removeInstance,
  updateInstance,
  instanceGameDir,
  type CreateInstanceInput
} from './instances'
import { isRunning, launchInstance, runningInstanceIds, onRunningChanged } from './launcher'
import { detectJava, getSettings, setSettings } from './settings'
import { applyControls } from './gameoptions'
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
import { importLocalPack, listLoaderVersions } from './modpack'
import { readSavedServers } from './nbtReader'
import { applyToAllInstances } from './chatmod'
import { detectAllJavas } from './java'
import { setCustomInstancesDir } from './persist'
import { startRelayRegistration, getOwnPresence, setIdleState } from './presence'
import { initDiscord, destroyDiscord } from './discord'
import { listFriends, addFriend, removeFriend, pollFriend, generateFriendCode, generatePresenceSecret } from './friends'
import { startUpdateChecker, checkForUpdate, openDownloadUrl, downloadUpdate, installAndRestart, setBetaUpdates, downloadPendingUpdate } from './updater'
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from './snapshots'
import { createDiagnosticBundle, exportInstanceBackup, importInstanceBackup, instanceStorage, repairInstance } from './maintenance'
import {
  installCompatibleMod,
  listManagedMods,
  removeManagedMod,
  searchCompatibleMods,
  toggleManagedMod,
  updateManagedMods
} from './customMods'
import type { Friend } from '@shared/types'
import type { AppSettings, BrowseParams, ServerEntry } from '@shared/types'

// Lite mode also strips GPU-accelerated rendering to remove the GPU process
// entirely (~60-150 MB). This only takes effect if applied before the app is
// ready, so it must run here at module load. getSettings() is synchronous and
// only touches app.getPath('userData') + fs, which work fine pre-ready.
if (getSettings().liteMode) {
  app.disableHardwareAcceleration()
}

/** The single launcher window, or null while parked in the tray. */
let mainWindow: BrowserWindow | null = null
/** The tray icon, present only while the window has been destroyed by the tray-while-playing policy. */
let tray: Tray | null = null
/** True exactly when the window was intentionally destroyed by the "Free memory while playing" policy. */
let trayModeActive = false

function loadAppIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../resources/icon.png')
  return nativeImage.createFromPath(iconPath)
}

function createWindow(): BrowserWindow {
  const icon = loadAppIcon()

  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    title: 'Thendrask Launcher',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win

  win.on('ready-to-show', () => win.show())

  win.on('minimize', () => {
    if (typeof global.gc === 'function') global.gc()
    setIdleState(true)
    win.webContents.send('app:idle')
  })

  win.on('restore', () => {
    setIdleState(false)
    win.webContents.send('app:active')
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    openExternalSafe(details.url).catch((err) => console.error('[window-open]', err.message))
    return { action: 'deny' }
  })

  if (!app.isPackaged) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
    })
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error(`[renderer:load] ${code} ${description} ${url}`)
    })
  }

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** Recreate/show the window and drop the tray icon. Used by the tray menu, tray click, and the auto-restore policy. */
function showFromTray(): void {
  trayModeActive = false
  destroyTray()
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

/** Destroy the launcher window and park it in the system tray — frees the whole renderer process. */
function enterTrayMode(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  trayModeActive = true
  mainWindow.destroy()
  mainWindow = null
  createTray()
}

function createTray(): void {
  if (tray) return
  tray = new Tray(loadAppIcon())
  tray.setToolTip('Thendrask Launcher')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Launcher', click: () => showFromTray() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => showFromTray())
}

function destroyTray(): void {
  if (!tray) return
  tray.destroy()
  tray = null
}

/**
 * Applies the "Free memory while playing" policy. Runs on every running-state
 * transition reported by launcher.ts (a game reaching 'running', or exiting):
 * on the first game to reach running state, hide the window to the tray (if
 * the setting is on); once the last running game exits, restore it — but only
 * if this policy is the one that hid it in the first place.
 */
function applyTrayPolicy(): void {
  const aGameIsRunning = runningInstanceIds().length > 0
  if (aGameIsRunning && getSettings().trayWhilePlaying && mainWindow && !mainWindow.isDestroyed() && !trayModeActive) {
    enterTrayMode()
  } else if (!aGameIsRunning && trayModeActive) {
    showFromTray()
  }
}

/** Open a URL in the default browser, refusing anything that isn't http(s). */
function openExternalSafe(url: string): Promise<void> {
  const proto = new URL(url).protocol
  if (proto !== 'https:' && proto !== 'http:') {
    return Promise.reject(new Error(`Blocked non-http(s) URL: ${url}`))
  }
  return shell.openExternal(url)
}

/** Small helper to register an async IPC handler with consistent error logging. */
function handle<T>(channel: string, fn: (...args: any[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!mainWindow || event.sender !== mainWindow.webContents) {
        throw new Error('Rejected IPC call from an untrusted renderer.')
      }
      return await fn(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipc:${channel}]`, message)
      throw new Error(message, { cause: err })
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
  handle('shell:openExternal', (url: string) => openExternalSafe(url))

  // Accounts
  handle('accounts:list', () => listAccounts())
  handle('accounts:login', () => loginInteractive())
  handle('accounts:remove', (id: string) => removeAccount(id))
  handle('accounts:setActive', (id: string) => setActive(id))
  handle('profile:get', () => getMinecraftProfile())
  handle('profile:setCape', (capeId: string | null) => setActiveCape(capeId))
  handle('profile:previewSkin', (filePath: string) => previewSkin(filePath))
  handle('profile:uploadSkin', (filePath: string, variant: 'CLASSIC' | 'SLIM') => uploadSkin(filePath, variant))
  handle('profile:listSavedSkins', () => listSavedSkins())
  handle('profile:saveSkin', (filePath: string, variant: 'CLASSIC' | 'SLIM') => saveSkin(filePath, variant))
  handle('profile:deleteSavedSkin', (id: string) => deleteSavedSkin(id))
  handle('profile:uploadSavedSkin', (id: string, variant: 'CLASSIC' | 'SLIM') => uploadSavedSkin(id, variant))

  // Instances
  handle('instances:list', () => listInstances())
  handle('instances:create', async (input: CreateInstanceInput) => {
    // Auto-populate packVersionId on first install so update tracking works
    if (input.externalId && input.source && input.source !== 'manual' && !input.packVersionId) {
      try {
        let versions: Awaited<ReturnType<typeof fetchModrinthVersions>> | undefined
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
  handle('instances:remove', (id: string, deleteFiles = false) => {
    if (isRunning(id)) throw new Error('Stop the instance before removing it.')
    return removeInstance(id, deleteFiles)
  })

  handle('instances:update', (id: string, patch: Partial<import('@shared/types').Instance>) => {
    const allowed: Partial<import('@shared/types').Instance> = {}
    if ('name' in patch) {
      if (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.length > 100) throw new Error('Invalid instance name.')
      allowed.name = patch.name.trim()
    }
    if ('recommendedRamMb' in patch) {
      if (patch.recommendedRamMb !== undefined && (!Number.isInteger(patch.recommendedRamMb) || patch.recommendedRamMb < 512 || patch.recommendedRamMb > 65536)) throw new Error('Invalid RAM value.')
      allowed.recommendedRamMb = patch.recommendedRamMb
    }
    if ('jvmArgs' in patch) {
      if (patch.jvmArgs !== undefined && (typeof patch.jvmArgs !== 'string' || patch.jvmArgs.length > 4000)) throw new Error('Invalid JVM arguments.')
      allowed.jvmArgs = patch.jvmArgs
    }
    if ('favorite' in patch) allowed.favorite = patch.favorite === true
    if ('group' in patch) {
      if (patch.group !== undefined && (typeof patch.group !== 'string' || patch.group.length > 50)) throw new Error('Invalid group.')
      allowed.group = patch.group?.trim() || undefined
    }
    if ('tags' in patch) {
      if (!Array.isArray(patch.tags) || patch.tags.length > 20 || patch.tags.some((tag) => typeof tag !== 'string' || tag.length > 40)) throw new Error('Invalid tags.')
      allowed.tags = [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))]
    }
    return updateInstance(id, allowed)
  })
  handle('instances:running', () => runningInstanceIds())
  handle('instances:isRunning', (id: string) => isRunning(id))
  handle('instances:fetchScreenshots', (id: string) => {
    const inst = listInstances().find((i) => i.id === id)
    if (!inst?.externalId || !inst.source || inst.source === 'manual') return null
    return fetchAndStoreScreenshots(id, inst.source as 'modrinth' | 'curseforge' | 'ftb', inst.externalId)
  })

  // Launch
  handle('launch:start', (instanceId: string, serverAddress?: string) => launchInstance(instanceId, serverAddress))
  handle('instance:savedServers', (instanceId: string) => readSavedServers(instanceGameDir(instanceId)))

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
    if ('betaUpdates' in patch) {
      setBetaUpdates(!!next.betaUpdates)
      void checkForUpdate()
    }
    if ('autoDownloadUpdates' in patch && next.autoDownloadUpdates !== false) {
      // Re-enabled mid-session — fetch any update we already know about.
      downloadPendingUpdate()
    }
    return next
  })
  handle('settings:detectJava', () => detectJava())
  handle('settings:applyNoChatMod', (enable: boolean) => applyToAllInstances(enable))
  handle('settings:applyControlsAll', () => {
    const controls = getSettings().defaultControls ?? {}
    const all = listInstances()
    for (const inst of all) {
      applyControls(instanceGameDir(inst.id), inst.mcVersion, controls)
    }
    return all.length
  })

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
    if (isRunning(instanceId)) throw new Error('Stop the instance before adding mods.')
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile() || !sourcePath.toLowerCase().endsWith('.jar')) {
      throw new Error('Select a valid mod JAR file.')
    }
    const modsDir = join(instanceGameDir(instanceId), 'mods')
    mkdirSync(modsDir, { recursive: true })
    const dest = join(modsDir, basename(sourcePath))
    copyFileSync(sourcePath, dest)
    return basename(sourcePath)
  })

  handle('instance:listLocalMods', (instanceId: string) => {
    const modsDir = join(instanceGameDir(instanceId), 'mods')
    if (!existsSync(modsDir)) return []
    const managedNames = new Set(listManagedMods(instanceId).map((mod) => mod.name))
    return readdirSync(modsDir)
      .filter((f) => (f.endsWith('.jar') || f.endsWith('.jar.disabled')) && !managedNames.has(f))
      .map((f) => {
        const size = statSync(join(modsDir, f)).size
        return { name: f, size, enabled: f.endsWith('.jar') }
      })
  })

  handle('instance:removeMod', (instanceId: string, fileName: string) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before removing mods.')
    // Plain file names only — no separators or '..' that could reach outside mods/
    if (basename(fileName) !== fileName || (!fileName.endsWith('.jar') && !fileName.endsWith('.jar.disabled'))) {
      throw new Error('Invalid mod file name.')
    }
    const modPath = join(instanceGameDir(instanceId), 'mods', fileName)
    if (existsSync(modPath)) unlinkSync(modPath)
  })

  handle('instance:toggleLocalMod', (instanceId: string, fileName: string, enabled: boolean) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before changing mods.')
    if (typeof enabled !== 'boolean') throw new Error('Invalid mod state.')
    if (basename(fileName) !== fileName || (!fileName.endsWith('.jar') && !fileName.endsWith('.jar.disabled'))) {
      throw new Error('Invalid mod file name.')
    }
    const modsDir = join(instanceGameDir(instanceId), 'mods')
    const baseName = fileName.endsWith('.disabled') ? fileName.slice(0, -'.disabled'.length) : fileName
    const from = join(modsDir, enabled ? `${baseName}.disabled` : baseName)
    const to = join(modsDir, enabled ? baseName : `${baseName}.disabled`)
    if (!existsSync(from)) throw new Error('Mod file not found.')
    renameSync(from, to)
    return { name: basename(to), size: statSync(to).size, enabled }
  })

  // Custom modpack builder (Modrinth)
  handle('customMods:search', (instanceId: string, query: string, source: 'modrinth' | 'curseforge') => searchCompatibleMods(instanceId, query, source))
  handle('customMods:list', (instanceId: string) => listManagedMods(instanceId))
  handle('customMods:install', (instanceId: string, projectId: string, source: 'modrinth' | 'curseforge') => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before installing mods.')
    return installCompatibleMod(instanceId, projectId, source)
  })
  handle('customMods:toggle', (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string, enabled: boolean) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before changing mods.')
    return toggleManagedMod(instanceId, source, projectId, enabled)
  })
  handle('customMods:remove', (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before removing mods.')
    return removeManagedMod(instanceId, source, projectId)
  })
  handle('customMods:update', (instanceId: string) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before updating mods.')
    return updateManagedMods(instanceId)
  })

  // Backups, repair, storage, and diagnostics
  handle('instance:snapshots', (instanceId: string) => listSnapshots(instanceId))
  handle('instance:createSnapshot', (instanceId: string) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before creating a snapshot.')
    return createSnapshot(instanceId)
  })
  handle('instance:restoreSnapshot', (instanceId: string, snapshotId: string) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before restoring a snapshot.')
    restoreSnapshot(instanceId, snapshotId)
    return listSnapshots(instanceId)
  })
  handle('instance:deleteSnapshot', (instanceId: string, snapshotId: string) => {
    deleteSnapshot(instanceId, snapshotId)
    return listSnapshots(instanceId)
  })
  handle('instance:storage', (instanceId: string) => instanceStorage(instanceId))
  handle('instance:repair', (instanceId: string) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before repairing it.')
    return repairInstance(instanceId)
  })
  handle('instance:diagnostics', async (instanceId: string) => {
    const path = await createDiagnosticBundle(instanceId)
    shell.showItemInFolder(path)
    return path
  })
  handle('instance:exportBackup', (instanceId: string) => {
    if (isRunning(instanceId)) throw new Error('Stop the instance before exporting it.')
    const path = exportInstanceBackup(instanceId)
    shell.showItemInFolder(path)
    return path
  })
  handle('instance:importBackup', (path: string) => importInstanceBackup(path))

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
      removeInstance(tempInst.id, true)
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
  const { instancesDir: customDir, friendCode, presenceSecret, discordRpc, discordClientId } = getSettings()
  if (customDir) setCustomInstancesDir(customDir)
  initDiscord(discordClientId, !!discordRpc)

  // Auto-generate a friend code for this user on first run
  if (!friendCode) setSettings({ friendCode: generateFriendCode() })
  if (!presenceSecret) setSettings({ presenceSecret: generatePresenceSecret() })

  // Auto-apply the default relay URL if none is saved yet
  if (!getSettings().relayUrl) setSettings({ relayUrl: 'https://relay.sxarlos.store' })

  startRelayRegistration()
  registerIpcHandlers()
  createWindow()
  startUpdateChecker()

  // "Free memory while playing": hide the window to the tray when a game
  // reaches its running state, restore it once the last one exits.
  onRunningChanged(applyTrayPolicy)

  app.on('activate', () => {
    if (trayModeActive) {
      showFromTray()
      return
    }
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  destroyDiscord()
})

app.on('before-quit', () => {
  destroyTray()
})

app.on('window-all-closed', () => {
  // The tray-while-playing policy destroys the window on purpose while a game
  // keeps running (detached: false — quitting here would kill the game too).
  // Only fall through to the normal quit-on-close-all behavior when that
  // policy isn't the reason the window count hit zero.
  if (trayModeActive) return
  if (process.platform !== 'darwin') app.quit()
})
