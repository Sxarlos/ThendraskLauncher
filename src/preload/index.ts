import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppSettings,
  BrowseParams,
  Friend,
  FriendPresence,
  Instance,
  InstanceRepairResult,
  InstanceSnapshot,
  InstanceStorageInfo,
  JavaInstall,
  LaunchProgress,
  LocalMod,
  MinecraftProfile,
  SkinPreview,
  SavedSkin,
  ModInstallResult,
  ModSearchResult,
  ModpackResult,
  MojangVersion,
  PackMod,
  PackOverview,
  PackVersion,
  ServerEntry,
  ServerStatus,
  UpdateInfo,
  VersionChangelog
} from '@shared/types'

export interface CreateInstanceInput {
  name: string
  mcVersion: string
  loader?: Instance['loader']
  loaderVersion?: string
  source?: Instance['source']
  externalId?: string
  packVersionId?: string
  iconUrl?: string
}

/**
 * The typed API exposed to the renderer as `window.api`.
 * Thin forwarding layer over IPC — no logic lives here.
 */
const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    /** The host OS, so the renderer can adapt platform-specific UI (e.g. file pickers). */
    platform: process.platform as NodeJS.Platform
  },
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),
    login: (): Promise<Account[]> => ipcRenderer.invoke('accounts:login'),
    remove: (id: string): Promise<Account[]> => ipcRenderer.invoke('accounts:remove', id),
    setActive: (id: string): Promise<Account[]> => ipcRenderer.invoke('accounts:setActive', id)
  },
  instances: {
    list: (): Promise<Instance[]> => ipcRenderer.invoke('instances:list'),
    create: (input: CreateInstanceInput): Promise<Instance> =>
      ipcRenderer.invoke('instances:create', input),
    update: (id: string, patch: Partial<Instance>): Promise<Instance | undefined> =>
      ipcRenderer.invoke('instances:update', id, patch),
    remove: (id: string, deleteFiles = false): Promise<Instance[]> =>
      ipcRenderer.invoke('instances:remove', id, deleteFiles),
    running: (): Promise<string[]> => ipcRenderer.invoke('instances:running'),
    fetchScreenshots: (id: string): Promise<string[] | null> =>
      ipcRenderer.invoke('instances:fetchScreenshots', id)
  },
  launch: {
    start: (instanceId: string, serverAddress?: string): Promise<void> =>
      ipcRenderer.invoke('launch:start', instanceId, serverAddress),
    onProgress: (cb: (p: LaunchProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: LaunchProgress): void => cb(p)
      ipcRenderer.on('launch:progress', listener)
      return () => ipcRenderer.removeListener('launch:progress', listener)
    },
    onLog: (cb: (e: { instanceId: string; line: string }) => void): (() => void) => {
      const listener = (_e: unknown, entry: { instanceId: string; line: string }): void => cb(entry)
      ipcRenderer.on('launch:log', listener)
      return () => ipcRenderer.removeListener('launch:log', listener)
    }
  },
  mojang: {
    versions: (): Promise<MojangVersion[]> => ipcRenderer.invoke('mojang:versions')
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke('settings:set', patch),
    detectJava: (): Promise<{ path: string; version?: string; ok: boolean }> =>
      ipcRenderer.invoke('settings:detectJava'),
    applyNoChatMod: (enable: boolean): Promise<{ applied: number; skipped: number }> =>
      ipcRenderer.invoke('settings:applyNoChatMod', enable),
    applyControlsToAll: (): Promise<number> => ipcRenderer.invoke('settings:applyControlsAll')
  },
  java: {
    list: (): Promise<JavaInstall[]> => ipcRenderer.invoke('java:list')
  },
  dialog: {
    pickDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDir'),
    pickFile: (filters?: Electron.FileFilter[]): Promise<string | null> =>
      ipcRenderer.invoke('dialog:pickFile', filters),
    pickModFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:pickModFiles')
  },
  friends: {
    list: (): Promise<Friend[]> => ipcRenderer.invoke('friends:list'),
    add: (data: Omit<Friend, 'id'>): Promise<Friend[]> => ipcRenderer.invoke('friends:add', data),
    remove: (id: string): Promise<Friend[]> => ipcRenderer.invoke('friends:remove', id),
    poll: (code: string): Promise<FriendPresence> => ipcRenderer.invoke('friends:poll', code),
  },
  presence: {
    own: (): Promise<FriendPresence> => ipcRenderer.invoke('presence:own'),
  },
  browse: {
    modrinth: (params: BrowseParams): Promise<ModpackResult[]> =>
      ipcRenderer.invoke('browse:modrinth', params),
    curseforge: (params: BrowseParams): Promise<ModpackResult[]> =>
      ipcRenderer.invoke('browse:curseforge', params),
    ftb: (params: BrowseParams): Promise<ModpackResult[]> =>
      ipcRenderer.invoke('browse:ftb', params),
    ftbLegacy: (params: BrowseParams, category: string): Promise<ModpackResult[]> =>
      ipcRenderer.invoke('browse:ftb-legacy', params, category),
    atlauncher: (params: BrowseParams, category: string): Promise<ModpackResult[]> =>
      ipcRenderer.invoke('browse:atlauncher', params, category),
    technic: (params: BrowseParams): Promise<ModpackResult[]> =>
      ipcRenderer.invoke('browse:technic', params)
  },
  loader: {
    versions: (loader: string, mcVersion: string): Promise<string[]> =>
      ipcRenderer.invoke('loader:versions', loader, mcVersion)
  },
  modpack: {
    changelog: (instanceId: string): Promise<VersionChangelog[]> =>
      ipcRenderer.invoke('modpack:changelog', instanceId),
    overview: (instanceId: string): Promise<PackOverview | null> =>
      ipcRenderer.invoke('modpack:overview', instanceId),
    versions: (instanceId: string): Promise<PackVersion[]> =>
      ipcRenderer.invoke('modpack:versions', instanceId),
    mods: (instanceId: string): Promise<PackMod[]> =>
      ipcRenderer.invoke('modpack:mods', instanceId),
    switchVersion: (instanceId: string, versionId: string): Promise<Instance | undefined> =>
      ipcRenderer.invoke('modpack:switchVersion', instanceId, versionId),
    importFile: (filePath: string): Promise<Instance | undefined> =>
      ipcRenderer.invoke('modpack:importFile', filePath)
  },
  instance: {
    savedServers: (instanceId: string): Promise<{ name: string; ip: string }[]> =>
      ipcRenderer.invoke('instance:savedServers', instanceId),
    openDir: (instanceId: string): Promise<void> =>
      ipcRenderer.invoke('instance:openDir', instanceId),
    addMod: (instanceId: string, sourcePath: string): Promise<string> =>
      ipcRenderer.invoke('instance:addMod', instanceId, sourcePath),
    listLocalMods: (instanceId: string): Promise<LocalMod[]> =>
      ipcRenderer.invoke('instance:listLocalMods', instanceId),
    removeMod: (instanceId: string, fileName: string): Promise<void> =>
      ipcRenderer.invoke('instance:removeMod', instanceId, fileName),
    toggleLocalMod: (instanceId: string, fileName: string, enabled: boolean): Promise<LocalMod> =>
      ipcRenderer.invoke('instance:toggleLocalMod', instanceId, fileName, enabled),
    snapshots: (instanceId: string): Promise<InstanceSnapshot[]> =>
      ipcRenderer.invoke('instance:snapshots', instanceId),
    createSnapshot: (instanceId: string): Promise<InstanceSnapshot> =>
      ipcRenderer.invoke('instance:createSnapshot', instanceId),
    restoreSnapshot: (instanceId: string, snapshotId: string): Promise<InstanceSnapshot[]> =>
      ipcRenderer.invoke('instance:restoreSnapshot', instanceId, snapshotId),
    deleteSnapshot: (instanceId: string, snapshotId: string): Promise<InstanceSnapshot[]> =>
      ipcRenderer.invoke('instance:deleteSnapshot', instanceId, snapshotId),
    storage: (instanceId: string): Promise<InstanceStorageInfo> =>
      ipcRenderer.invoke('instance:storage', instanceId),
    repair: (instanceId: string): Promise<InstanceRepairResult> =>
      ipcRenderer.invoke('instance:repair', instanceId),
    diagnostics: (instanceId: string): Promise<string> =>
      ipcRenderer.invoke('instance:diagnostics', instanceId),
    exportBackup: (instanceId: string): Promise<string> =>
      ipcRenderer.invoke('instance:exportBackup', instanceId),
    importBackup: (path: string): Promise<Instance> =>
      ipcRenderer.invoke('instance:importBackup', path)
  },
  customMods: {
    search: (instanceId: string, query: string, source: 'modrinth' | 'curseforge'): Promise<ModSearchResult[]> =>
      ipcRenderer.invoke('customMods:search', instanceId, query, source),
    list: (instanceId: string): Promise<LocalMod[]> =>
      ipcRenderer.invoke('customMods:list', instanceId),
    install: (instanceId: string, projectId: string, source: 'modrinth' | 'curseforge'): Promise<ModInstallResult> =>
      ipcRenderer.invoke('customMods:install', instanceId, projectId, source),
    toggle: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string, enabled: boolean): Promise<LocalMod[]> =>
      ipcRenderer.invoke('customMods:toggle', instanceId, source, projectId, enabled),
    remove: (instanceId: string, source: 'modrinth' | 'curseforge', projectId: string): Promise<LocalMod[]> =>
      ipcRenderer.invoke('customMods:remove', instanceId, source, projectId),
    updateAll: (instanceId: string): Promise<ModInstallResult> =>
      ipcRenderer.invoke('customMods:update', instanceId)
  },
  profile: {
    get: (): Promise<MinecraftProfile> => ipcRenderer.invoke('profile:get'),
    setCape: (capeId: string | null): Promise<void> =>
      ipcRenderer.invoke('profile:setCape', capeId),
    previewSkin: (filePath: string): Promise<SkinPreview> =>
      ipcRenderer.invoke('profile:previewSkin', filePath),
    uploadSkin: (filePath: string, variant: 'CLASSIC' | 'SLIM'): Promise<MinecraftProfile> =>
      ipcRenderer.invoke('profile:uploadSkin', filePath, variant),
    listSavedSkins: (): Promise<SavedSkin[]> => ipcRenderer.invoke('profile:listSavedSkins'),
    saveSkin: (filePath: string, variant: 'CLASSIC' | 'SLIM'): Promise<SavedSkin[]> =>
      ipcRenderer.invoke('profile:saveSkin', filePath, variant),
    deleteSavedSkin: (id: string): Promise<SavedSkin[]> =>
      ipcRenderer.invoke('profile:deleteSavedSkin', id),
    uploadSavedSkin: (id: string, variant: 'CLASSIC' | 'SLIM'): Promise<MinecraftProfile> =>
      ipcRenderer.invoke('profile:uploadSavedSkin', id, variant)
  },
  servers: {
    list: (): Promise<ServerEntry[]> => ipcRenderer.invoke('servers:list'),
    add: (data: Omit<ServerEntry, 'id'>): Promise<ServerEntry[]> =>
      ipcRenderer.invoke('servers:add', data),
    remove: (id: string): Promise<ServerEntry[]> => ipcRenderer.invoke('servers:remove', id),
    ping: (host: string, port?: number): Promise<ServerStatus> =>
      ipcRenderer.invoke('servers:ping', host, port)
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
  },
  window: {
    onIdle: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('app:idle', listener)
      return () => ipcRenderer.removeListener('app:idle', listener)
    },
    onActive: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('app:active', listener)
      return () => ipcRenderer.removeListener('app:active', listener)
    }
  },
  update: {
    check: (): Promise<UpdateInfo | null> => ipcRenderer.invoke('update:check'),
    onChecking: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('update:checking', listener)
      return () => ipcRenderer.removeListener('update:checking', listener)
    },
    onUpToDate: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('update:up-to-date', listener)
      return () => ipcRenderer.removeListener('update:up-to-date', listener)
    },
    onAvailable: (cb: (info: UpdateInfo) => void): (() => void) => {
      const listener = (_e: unknown, info: UpdateInfo): void => cb(info)
      ipcRenderer.on('update:available', listener)
      return () => ipcRenderer.removeListener('update:available', listener)
    },
    onDownloadProgress: (cb: (percent: number) => void): (() => void) => {
      const listener = (_e: unknown, percent: number): void => cb(percent)
      ipcRenderer.on('update:download-progress', listener)
      return () => ipcRenderer.removeListener('update:download-progress', listener)
    },
    onReady: (cb: (info: UpdateInfo) => void): (() => void) => {
      const listener = (_e: unknown, info: UpdateInfo): void => cb(info)
      ipcRenderer.on('update:ready', listener)
      return () => ipcRenderer.removeListener('update:ready', listener)
    },
    onError: (cb: (message: string) => void): (() => void) => {
      const listener = (_e: unknown, message: string): void => cb(message)
      ipcRenderer.on('update:error', listener)
      return () => ipcRenderer.removeListener('update:error', listener)
    },
    openDownload: (url: string): Promise<void> => ipcRenderer.invoke('update:openDownload', url),
    download: (url: string): Promise<string> => ipcRenderer.invoke('update:download', url),
    install: (path: string): Promise<void> => ipcRenderer.invoke('update:install', path)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose preload API:', error)
  }
} else {
  // @ts-ignore - non-isolated fallback (not used with our config)
  window.api = api
}
