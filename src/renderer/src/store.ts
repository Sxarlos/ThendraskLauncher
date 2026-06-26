import { create } from 'zustand'
import type { Account, Instance, LaunchProgress, Page, ThemeId, UpdateInfo } from '@shared/types'

export const DEFAULT_THEME: ThemeId = 'ender'

/** Apply a theme to the document by setting the data-theme attribute. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme)
}

interface AppState {
  page: Page
  setPage: (page: Page) => void

  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  loadTheme: () => Promise<void>

  accounts: Account[]
  refreshAccounts: () => Promise<void>

  instances: Instance[]
  refreshInstances: () => Promise<void>

  /** Latest launch progress per instance id. */
  progress: Record<string, LaunchProgress>
  setProgress: (p: LaunchProgress) => void

  /** Count of in-flight installs (from Browse tab). */
  installingCount: number
  setInstalling: (delta: 1 | -1) => void

  /** Captured stdout per instance id (capped at 500 lines). */
  logs: Record<string, string[]>
  addLog: (instanceId: string, line: string) => void
  clearLogs: (instanceId: string) => void

  updateInfo: UpdateInfo | null
  setUpdateInfo: (info: UpdateInfo | null) => void

  /** Set before navigating to Library so the panel auto-opens for that instance. */
  pendingLibraryInstanceId: string | null
  setPendingLibraryInstanceId: (id: string | null) => void

  busy: boolean
  error: string | null
  setError: (msg: string | null) => void
}

export const useApp = create<AppState>((set) => ({
  page: 'home',
  setPage: (page) => set({ page }),

  theme: DEFAULT_THEME,
  setTheme: (theme) => {
    applyTheme(theme)
    void window.api.settings.set({ theme })
    set({ theme })
  },
  loadTheme: async () => {
    const settings = await window.api.settings.get()
    const theme = settings.theme ?? DEFAULT_THEME
    applyTheme(theme)
    set({ theme })
  },

  accounts: [],
  refreshAccounts: async () => {
    const accounts = await window.api.accounts.list()
    set({ accounts })
  },

  instances: [],
  refreshInstances: async () => {
    const instances = await window.api.instances.list()
    set({ instances })
  },

  progress: {},
  setProgress: (p) => set((s) => ({ progress: { ...s.progress, [p.instanceId]: p } })),

  installingCount: 0,
  setInstalling: (delta) =>
    set((s) => ({ installingCount: Math.max(0, s.installingCount + delta) })),

  logs: {},
  addLog: (instanceId, line) =>
    set((s) => {
      const prev = s.logs[instanceId] ?? []
      const next = prev.length >= 500 ? [...prev.slice(-499), line] : [...prev, line]
      return { logs: { ...s.logs, [instanceId]: next } }
    }),
  clearLogs: (instanceId) =>
    set((s) => ({ logs: { ...s.logs, [instanceId]: [] } })),

  updateInfo: null,
  setUpdateInfo: (updateInfo) => set({ updateInfo }),

  pendingLibraryInstanceId: null,
  setPendingLibraryInstanceId: (pendingLibraryInstanceId) => set({ pendingLibraryInstanceId }),

  busy: false,
  error: null,
  setError: (error) => set({ error })
}))

export const activeAccount = (accounts: Account[]): Account | undefined =>
  accounts.find((a) => a.active)
