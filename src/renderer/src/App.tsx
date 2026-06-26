import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import AccountSwitcher from './components/AccountSwitcher'
import SplashScreen from './components/SplashScreen'
import SetupWizard from './components/SetupWizard'
import Home from './pages/Home'
import Library from './pages/Library'
import Servers from './pages/Servers'
import Friends from './pages/Friends'
import Settings from './pages/Settings'
import { useApp } from './store'

const PAGES = {
  home: Home,
  library: Library,
  servers: Servers,
  friends: Friends,
  settings: Settings
}

const TITLES: Record<string, string> = {
  home: 'Home',
  library: 'Library',
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
  const setUpdateInfo = useApp((s) => s.setUpdateInfo)
  const Current = PAGES[page]

  const [appReady, setAppReady] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    Promise.all([loadTheme(), refreshAccounts(), refreshInstances()])
      .then(async () => {
        const settings = await window.api.settings.get()
        if (!settings.setupComplete) setShowWizard(true)
        setAppReady(true)
      })
      .catch(() => setAppReady(true))

    const unsubProgress = window.api.launch.onProgress((p) => {
      if (p.state === 'preparing') clearLogs(p.instanceId)
      setProgress(p)
    })
    // onLog was added in a later preload version — guard so older builds don't crash
    const unsubLog = (window.api.launch as any).onLog?.((e: { instanceId: string; line: string }) =>
      addLog(e.instanceId, e.line)
    ) as (() => void) | undefined

    const unsubUpdate = (window.api as any).update?.onAvailable?.((info: any) => setUpdateInfo(info)) as (() => void) | undefined

    return () => { unsubProgress(); unsubLog?.(); unsubUpdate?.() }
  }, [loadTheme, refreshAccounts, refreshInstances, setProgress, addLog, clearLogs, setUpdateInfo])

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

        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Current />
        </main>
      </div>

      <SplashScreen appReady={appReady} />
      {appReady && showWizard && (
        <SetupWizard onComplete={() => setShowWizard(false)} />
      )}
    </div>
  )
}
