import { lazy, Suspense, useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountSwitcher from './components/AccountSwitcher'
import SplashScreen from './components/SplashScreen'
import SetupWizard from './components/SetupWizard'
import UpdateToast from './components/UpdateToast'
import Home from './pages/Home'
import { useApp } from './store'

const loadLibrary = () => import('./pages/Library')
const loadGregTech = () => import('./pages/GregTech')
const loadServers = () => import('./pages/Servers')
const loadFriends = () => import('./pages/Friends')
const loadSettings = () => import('./pages/Settings')

const Library = lazy(loadLibrary)
const GregTech = lazy(loadGregTech)
const Servers = lazy(loadServers)
const Friends = lazy(loadFriends)
const Settings = lazy(loadSettings)

function preloadPages(): void {
  // Imports are cached by the module loader. Fetch the tab chunks while the
  // startup splash is still visible so the first navigation never suspends.
  void Promise.allSettled([
    loadLibrary(),
    loadGregTech(),
    loadServers(),
    loadFriends(),
    loadSettings()
  ])
}

function PageFallback(): JSX.Element {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'var(--bg)' }}
      aria-label="Loading page"
    >
      <div
        className="w-5 h-5 rounded-full animate-spin"
        style={{
          border: '2px solid var(--border)',
          borderTopColor: 'var(--accent-strong)'
        }}
      />
    </div>
  )
}

const PAGES = {
  home: Home,
  library: Library,
  gregtech: GregTech,
  servers: Servers,
  friends: Friends,
  settings: Settings
}

const TITLES: Record<string, string> = {
  home: 'Home',
  library: 'Library',
  gregtech: 'GregTech Hub',
  servers: 'Servers',
  friends: 'Friends',
  settings: 'Settings'
}

export default function App(): JSX.Element {
  const page = useApp((s) => s.page)
  const error = useApp((s) => s.error)
  const setError = useApp((s) => s.setError)
  const refreshAccounts = useApp((s) => s.refreshAccounts)
  const refreshInstances = useApp((s) => s.refreshInstances)
  const setProgress = useApp((s) => s.setProgress)
  const addLog = useApp((s) => s.addLog)
  const clearLogs = useApp((s) => s.clearLogs)
  const loadTheme = useApp((s) => s.loadTheme)
  const loadLiteMode = useApp((s) => s.loadLiteMode)
  const setGregTechHubEnabled = useApp((s) => s.setGregTechHubEnabled)
  const setUpdateInfo = useApp((s) => s.setUpdateInfo)
  const setUpdateDownload = useApp((s) => s.setUpdateDownload)
  const setUpdateCheckStatus = useApp((s) => s.setUpdateCheckStatus)
  const setImportProgress = useApp((s) => s.setImportProgress)
  const clearAllLogs = useApp((s) => s.clearAllLogs)
  const setPage = useApp((s) => s.setPage)
  const setPendingLibraryInstanceId = useApp((s) => s.setPendingLibraryInstanceId)
  const Current = PAGES[page]

  const [appReady, setAppReady] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    let cancelled = false
    const preloadTimer = window.setTimeout(preloadPages, 250)

    const initialize = async (): Promise<void> => {
      const results = await Promise.allSettled([
        loadTheme(),
        loadLiteMode(),
        refreshAccounts(),
        refreshInstances(),
        window.api.settings.get()
      ])
      if (cancelled) return

      const settingsResult = results[4]
      if (settingsResult.status === 'fulfilled') {
        setGregTechHubEnabled(!!settingsResult.value.gregTechHubEnabled)
        if (!settingsResult.value.setupComplete) setShowWizard(true)
      }

      const failedSections = ['theme', 'performance settings', 'accounts', 'instances', 'settings']
        .filter((_, index) => results[index]?.status === 'rejected')
      if (failedSections.length > 0) {
        setError(`Some launcher data could not be loaded: ${failedSections.join(', ')}. You can continue, but affected features may need a reload.`)
      }

      setAppReady(true)
    }

    void initialize().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Launcher startup failed.')
        setAppReady(true)
      }
    })

    const unsubProgress = window.api.launch.onProgress((p) => {
      if (p.state === 'preparing') clearLogs(p.instanceId)
      setProgress(p)
      if (p.action === 'manual-files-required') {
        setPendingLibraryInstanceId(p.instanceId)
        setPage('library')
      }
    })
    const unsubLog = window.api.launch.onLog((e) => addLog(e.instanceId, e.line))
    const unsubImportProgress = window.api.modpack.onImportProgress((progress) => {
      setImportProgress({ ...progress, status: progress.status ?? 'active' })
    })
    const unsubChecking = window.api.update.onChecking(() => setUpdateCheckStatus('checking'))
    const unsubUpToDate = window.api.update.onUpToDate(() => setUpdateCheckStatus('up-to-date'))
    const unsubUpdate = window.api.update.onAvailable((info) => {
      // Whether a silent download starts is main's call (auto-download
      // setting); it flips us to 'downloading' via a progress event.
      // Re-checks re-fire this every 5 minutes while an update is pending,
      // so only toast the first sighting of a version.
      if (useApp.getState().updateInfo?.version !== info.version) {
        setUpdateCheckStatus('found')
      }
      setUpdateInfo(info)
    })
    const unsubDownload = window.api.update.onDownloadProgress((percent) =>
      setUpdateDownload({ state: 'downloading', progress: percent })
    )
    const unsubReady = window.api.update.onReady((info) => {
      setUpdateInfo(info)
      setUpdateDownload({ state: 'ready', progress: 100 })
      setUpdateCheckStatus('idle')
    })
    const unsubUpdateError = window.api.update.onError(() => {
      // Check failures just hide the toast; a failed download surfaces Retry.
      setUpdateCheckStatus('idle')
      if (useApp.getState().updateDownload.state === 'downloading') {
        setUpdateDownload({ state: 'error' })
      }
    })

    return () => {
      cancelled = true
      clearTimeout(preloadTimer)
      unsubProgress(); unsubLog(); unsubImportProgress(); unsubChecking(); unsubUpToDate()
      unsubUpdate(); unsubDownload(); unsubReady(); unsubUpdateError()
    }
  }, [loadTheme, loadLiteMode, refreshAccounts, refreshInstances, setGregTechHubEnabled, setProgress, addLog, clearLogs, setError, setUpdateInfo, setUpdateDownload, setUpdateCheckStatus, setImportProgress, setPage, setPendingLibraryInstanceId])

  useEffect(() => {
    const unsubIdle = window.api.window.onIdle(() => {
      clearAllLogs()
      // Free renderer V8 heap if GC was exposed via --expose-gc
      if (typeof (window as { gc?: () => void }).gc === 'function') {
        ;(window as { gc?: () => void }).gc!()
      }
    })
    return () => { unsubIdle() }
  }, [clearAllLogs])

  return (
    <div className="h-screen w-screen flex bg-bg" style={{ color: 'var(--text)' }}>
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 flex items-center justify-between px-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <span className="font-semibold text-sm tracking-wide" style={{ color: 'var(--text-dim)' }}>{TITLES[page]}</span>
          <AccountSwitcher />
        </header>

        {error && (
          <div className="mx-5 mt-3 flex items-start justify-between gap-3 text-sm rounded-xl px-4 py-2.5" style={{ background: 'rgba(var(--danger-rgb), 0.08)', border: '1px solid rgba(var(--danger-rgb), 0.2)', color: 'var(--danger-faint)' }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ color: 'var(--danger-soft)', opacity: 0.7 }} className="hover:opacity-100 transition-opacity">✕</button>
          </div>
        )}

        <main
          className="relative isolate flex-1 min-h-0 overflow-hidden flex flex-col"
          style={{ background: 'var(--bg)' }}
        >
          <Suspense fallback={<PageFallback />}>
            <Current key={page} />
          </Suspense>
        </main>
      </div>

      <SplashScreen appReady={appReady} />
      {appReady && showWizard && (
        <SetupWizard onComplete={() => setShowWizard(false)} />
      )}
      <UpdateToast />
    </div>
  )
}
