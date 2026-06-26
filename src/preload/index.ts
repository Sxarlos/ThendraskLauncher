import { contextBridge, ipcRenderer } from 'electron'
import type {
  Account,
  AppSettings,
  BrowseParams,
  Friend,
  FriendPresence,
  Instance,
  JavaInstall,
  LaunchProgress,
  MinecraftProfile,
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
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version')
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
    remove: (id: string): Promise<Instance[]> => ipcRenderer.invoke('instances:remove', id),
    running: (): Promise<string[]> => ipcRenderer.invoke('instances:running'),
    fetchScreenshots: (id: string): Promise<string[] | null> =>
      ipcRenderer.invoke('instances:fetchScreenshots', id)
  },
  launch: {
    start: (instanceId: string): Promise<void> => ipcRenderer.invoke('launch:start', instanceId),
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
      ipcRenderer.invoke('settings:applyNoChatMod', enable)
  },
  java: {
    list: (): Promise<JavaInstall[]> => ipcRenderer.invoke('java:list')
  },
  dialog: {
    pickDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDir'),
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
      ipcRenderer.invoke('browse:curseforge', params)
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
      ipcRenderer.invoke('modpack:switchVersion', instanceId, versionId)
  },
  instance: {
    openDir: (instanceId: string): Promise<void> =>
      ipcRenderer.invoke('instance:openDir', instanceId),
    addMod: (instanceId: string, sourcePath: string): Promise<string> =>
      ipcRenderer.invoke('instance:addMod', instanceId, sourcePath),
    listLocalMods: (instanceId: string): Promise<{ name: string; size: number }[]> =>
      ipcRenderer.invoke('instance:listLocalMods', instanceId),
    removeMod: (instanceId: string, fileName: string): Promise<void> =>
      ipcRenderer.invoke('instance:removeMod', instanceId, fileName)
  },
  profile: {
    get: (): Promise<MinecraftProfile> => ipcRenderer.invoke('profile:get'),
    setCape: (capeId: string | null): Promise<void> =>
      ipcRenderer.invoke('profile:setCape', capeId)
  },
  servers: {
    list: (): Promise<ServerEntry[]> => ipcRenderer.invoke('servers:list'),
    add: (data: Omit<ServerEntry, 'id'>): Promise<ServerEntry[]> =>
      ipcRenderer.invoke('servers:add', data),
    remove: (id: string): Promise<ServerEntry[]> => ipcRenderer.invoke('servers:remove', id),
    ping: (host: string, port?: number): Promise<ServerStatus> =>
      ipcRenderer.invoke('servers:ping', host, port)
  },
  update: {
    check: (): Promise<UpdateInfo | null> => ipcRenderer.invoke('update:check'),
    onAvailable: (cb: (info: UpdateInfo) => void): (() => void) => {
      const listener = (_e: unknown, info: UpdateInfo): void => cb(info)
      ipcRenderer.on('update:available', listener)
      return () => ipcRenderer.removeListener('update:available', listener)
    },
    openDownload: (url: string): Promise<void> => ipcRenderer.invoke('update:openDownload', url)
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
