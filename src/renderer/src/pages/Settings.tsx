import { useEffect, useRef, useState } from 'react'
import type { AppSettings, DefaultGameSettings, JavaInstall, ThemeId } from '@shared/types'
import { normalizeThemeId, useApp } from '../store'
import { CURATED_ACTIONS, codeToMcKey, friendlyKeyName, mouseButtonToMcKey } from '../lib/mcControls'

type SettingsTab = 'general' | 'appearance' | 'apikeys'

const THEMES: { id: ThemeId; name: string; desc: string; swatch: string; base: string }[] = [
  { id: 'thendrask', name: 'Thendrask', desc: 'Classic dark green',  swatch: '#22c55e', base: '#111318' },
  { id: 'amethyst', name: 'Amethyst', desc: 'Dark purple',         swatch: '#a855f7', base: '#111318' },
  { id: 'ocean',    name: 'Ocean',    desc: 'Cool sky blue',       swatch: '#0ea5e9', base: '#111318' },
  { id: 'crimson',  name: 'Crimson',  desc: 'Deep red',            swatch: '#f43f5e', base: '#111318' },
  { id: 'gold',     name: 'Gold',     desc: 'Warm amber',          swatch: '#f59e0b', base: '#111318' },
  { id: 'midnight', name: 'Midnight', desc: 'AMOLED black',        swatch: '#22c55e', base: '#050608' },
  { id: 'light',    name: 'Daylight', desc: 'Clean light theme',   swatch: '#16a34a', base: '#f4f5f7' },
]

/* ── Toggle switch ─────────────────────────────────────── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 transition-colors duration-200"
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? 'var(--accent-strong)' : 'var(--surface-3)',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <span
        className="absolute top-0.5 transition-transform duration-200"
        style={{
          left: 2,
          width: 20,
          height: 20,
          borderRadius: 10,
          background: '#fff',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          display: 'block',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  )
}

/* ── Row wrapper ───────────────────────────────────────── */
function Row({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-6 py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>{label}</div>
        {desc && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/* ── Section header ────────────────────────────────────── */
function SectionHeader({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      className="text-[10px] font-bold uppercase tracking-[0.18em] pt-5 pb-1"
      style={{ color: 'var(--text-faint)' }}
    >
      {children}
    </div>
  )
}

/* ── No Chat Restrictions row ─────────────────────────── */
type ChatModStatus = { applied: number; skipped: number } | 'applying' | 'error' | null

function NoChatRow({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}): JSX.Element {
  const [status, setStatus] = useState<ChatModStatus>(null)
  const enabled = !!settings.noChatRestrictions

  const toggle = async (v: boolean): Promise<void> => {
    onChange({ noChatRestrictions: v })
    setStatus('applying')
    try {
      const result = await window.api.settings.applyNoChatMod(v)
      setStatus(result)
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>
            No Chat Restrictions
          </div>
          <div className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Adds the <span style={{ color: 'var(--text-soft)' }}>No Chat Restrictions</span> mod to
            all your modded instances. Required in the UK and other regions where chat signing laws
            prevent players from joining servers that enforce unsigned-chat restrictions.
          </div>
        </div>
        <Toggle checked={enabled} onChange={toggle} />
      </div>

      {/* Status feedback */}
      {status === 'applying' && (
        <div className="mt-2.5 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span
            className="w-3 h-3 rounded-full border-2 shrink-0"
            style={{
              borderColor: 'rgba(var(--accent-rgb),0.2)',
              borderTopColor: 'var(--accent)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          {enabled ? 'Downloading and applying mod to instances…' : 'Removing mod from instances…'}
        </div>
      )}
      {status !== null && status !== 'applying' && status !== 'error' && (
        <div
          className="mt-2.5 flex items-center gap-2 text-xs px-3 py-2 rounded-xl"
          style={{
            background: 'rgba(var(--accent-rgb),0.06)',
            border: '1px solid rgba(var(--accent-rgb),0.15)',
            color: 'var(--accent)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {enabled
            ? `Applied to ${status.applied} instance${status.applied !== 1 ? 's' : ''}${status.skipped > 0 ? ` · ${status.skipped} skipped (no compatible version)` : ''}`
            : `Removed from ${status.applied} instance${status.applied !== 1 ? 's' : ''}`
          }
        </div>
      )}
      {status === 'error' && (
        <div
          className="mt-2.5 text-xs px-3 py-2 rounded-xl"
          style={{
            background: 'rgba(var(--danger-rgb),0.06)',
            border: '1px solid rgba(var(--danger-rgb),0.15)',
            color: 'var(--danger-soft)',
          }}
        >
          Failed to apply - check your internet connection and try again.
        </div>
      )}
    </div>
  )
}

/* ── Controls section ─────────────────────────────────── */
function ControlsSection({
  settings,
  onChange,
}: {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
}): JSX.Element {
  const controls = settings.defaultControls
  const enabled = controls !== undefined
  const controlsRef = useRef(controls)
  useEffect(() => {
    controlsRef.current = controls
  }, [controls])

  const [capturing, setCapturing] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<number | null>(null)

  const setBinding = (action: string, mcKey: string | null): void => {
    const next = { ...(controlsRef.current ?? {}) }
    if (mcKey === null) delete next[action]
    else next[action] = mcKey
    onChange({ defaultControls: next })
  }

  useEffect(() => {
    if (!capturing) return

    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        setBinding(capturing, null)
        setCapturing(null)
        return
      }
      const mcKey = codeToMcKey(e.code)
      if (mcKey) {
        setBinding(capturing, mcKey)
        setCapturing(null)
      }
      // Unmapped codes are ignored - stay in capture mode.
    }

    const onMouseDown = (e: MouseEvent): void => {
      e.preventDefault()
      const mcKey = mouseButtonToMcKey(e.button)
      if (mcKey) {
        setBinding(capturing, mcKey)
        setCapturing(null)
      }
    }

    const onBlur = (): void => setCapturing(null)

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing])

  const applyNow = async (): Promise<void> => {
    setApplying(true)
    setApplyResult(null)
    try {
      const n = await window.api.settings.applyControlsToAll()
      setApplyResult(n)
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <Row
        label="Set default controls"
        desc="Applied to every instance when it launches. Only the actions you bind here are changed - everything else keeps its in-game setting."
      >
        <Toggle
          checked={enabled}
          onChange={(v) => onChange({ defaultControls: v ? {} : undefined })}
        />
      </Row>

      {enabled && (
        <>
          <div className="py-2">
            {CURATED_ACTIONS.map(({ label, action }) => {
              const bound = controls?.[action]
              const isCapturing = capturing === action
              return (
                <div
                  key={action}
                  className="flex items-center justify-between gap-4 py-2"
                  style={{ borderBottom: '1px solid var(--border-soft)' }}
                >
                  <span className="text-sm" style={{ color: 'var(--text-soft)' }}>{label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCapturing(action)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-center transition-all"
                      style={{
                        minWidth: 110,
                        ...(isCapturing
                          ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.4)' }
                          : { background: 'var(--surface)', color: bound ? 'var(--text-bright)' : 'var(--text-faint)', border: '1px solid var(--border-soft)' }),
                      }}
                    >
                      {isCapturing ? 'Press a key…' : friendlyKeyName(bound)}
                    </button>
                    {bound && !isCapturing && (
                      <button
                        onClick={() => setBinding(action, null)}
                        title="Clear binding"
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0"
                        style={{ background: 'var(--surface)', color: 'var(--text-faint)', border: '1px solid var(--border-soft)' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3 py-3 flex-wrap">
            <button
              onClick={applyNow}
              disabled={applying}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: 'var(--accent-strong)', color: '#000' }}
            >
              {applying ? 'Applying…' : 'Apply to all instances now'}
            </button>
            {applyResult !== null && !applying && (
              <span className="text-xs" style={{ color: 'var(--accent)' }}>
                Applied to {applyResult} instance{applyResult !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <p className="text-xs pb-4 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            Controls are written into options.txt at every launch, so rebinding one of these actions
            in-game will be reverted next launch - that's the point. Only takes effect on Minecraft 1.13+.
          </p>
        </>
      )}
    </>
  )
}

/* ── Update check row ──────────────────────────────────── */
type UpdateCheckState = 'idle' | 'checking' | 'up-to-date' | 'available'

function UpdateCheckRow(): JSX.Element {
  const updateInfo     = useApp((s) => s.updateInfo)
  const updateDownload = useApp((s) => s.updateDownload)
  const setUpdateDownload = useApp((s) => s.setUpdateDownload)
  const [state, setState] = useState<UpdateCheckState>(updateInfo ? 'available' : 'idle')

  const check = async (): Promise<void> => {
    setState('checking')
    try {
      const result = await window.api.update.check()
      setState(result ? 'available' : 'up-to-date')
    } catch {
      setState('idle')
    }
  }

  // Manual download (auto-download opted out in Settings) or retry after a
  // failure. Success arrives via the 'update:ready' event.
  const startDownload = async (): Promise<void> => {
    if (!updateInfo) return
    setUpdateDownload({ state: 'downloading', progress: 0 })
    try {
      await window.api.update.download(updateInfo.downloadUrl)
    } catch {
      setUpdateDownload({ state: 'error', progress: 0 })
    }
  }

  const installUpdate = (): void => {
    if (updateDownload.state === 'ready') window.api.update.install('')
  }

  return (
    <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>Check for Updates</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Updates are checked automatically in the background. This checks right now.
          </div>
        </div>
        <button
          onClick={check}
          disabled={state === 'checking'}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'var(--accent-strong)', color: '#000' }}
        >
          {state === 'checking' ? 'Checking…' : 'Check now'}
        </button>
      </div>

      {state === 'up-to-date' && (
        <div
          className="mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-xl"
          style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          You're up to date.
        </div>
      )}

      {(state === 'available' || updateDownload.state !== 'idle') && updateInfo && (
        <div
          className="mt-3 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}
        >
          <div className="flex items-center justify-between gap-3 text-xs">
            <span style={{ color: 'var(--text-bright)' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>v{updateInfo.version}</span> is available
              {updateInfo.notes && <span style={{ color: 'var(--text-muted)' }}> - {updateInfo.notes}</span>}
            </span>

            {updateDownload.state === 'idle' || updateDownload.state === 'error' ? (
              <button
                onClick={startDownload}
                className="shrink-0 px-3 py-1 rounded-lg font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#000', fontSize: 11 }}
              >
                {updateDownload.state === 'error' ? 'Retry' : 'Download'}
              </button>
            ) : updateDownload.state === 'ready' ? (
              <button
                onClick={installUpdate}
                className="shrink-0 px-3 py-1 rounded-lg font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#000', fontSize: 11 }}
              >
                Restart to update
              </button>
            ) : null}
          </div>

          {updateDownload.state === 'downloading' && (
            <div className="mt-2.5 flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--accent-rgb),0.2)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${updateDownload.progress}%`, background: 'var(--accent)' }}
                />
              </div>
              <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--accent)' }}>
                {updateDownload.progress}%
              </span>
            </div>
          )}

          {updateDownload.state === 'error' && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--danger-soft)' }}>
              Download failed - check your connection and try again.
            </p>
          )}

          {updateDownload.state === 'ready' && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--accent)' }}>
              ✓ Downloaded in the background - restart to apply, or it installs automatically when you quit.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── General tab ───────────────────────────────────────── */
function GeneralTab({ settings, onChange }: { settings: AppSettings; onChange: (patch: Partial<AppSettings>) => void }): JSX.Element {
  const [javaInstalls, setJavaInstalls] = useState<JavaInstall[]>([])
  const [detecting, setDetecting] = useState(false)
  const [detectMsg, setDetectMsg] = useState<string | null>(null)
  const [javaPath, setJavaPath] = useState(settings.javaPath ?? '')

  useEffect(() => {
    window.api.java.list().then(setJavaInstalls).catch(() => {})
  }, [])

  const detectJava = async (): Promise<void> => {
    setDetecting(true)
    setDetectMsg(null)
    try {
      const result = await window.api.settings.detectJava()
      if (result.ok && result.path) {
        setJavaPath(result.path)
        onChange({ javaPath: result.path })
        setDetectMsg(`Detected: Java ${result.version ?? '?'}`)
      } else {
        setDetectMsg('No Java found - install Java 17+ or set path manually')
      }
    } catch {
      setDetectMsg('Detection failed')
    } finally {
      setDetecting(false)
    }
  }

  const pickDir = async (): Promise<void> => {
    const dir = await window.api.dialog.pickDir()
    if (dir) onChange({ instancesDir: dir })
  }

  const pickJava = async (): Promise<void> => {
    // On Windows the executable is java.exe; on macOS/Linux the binary has no
    // extension, so don't filter it out.
    const filters =
      window.api.app.platform === 'win32'
        ? [{ name: 'Java Executable', extensions: ['exe'] }]
        : [{ name: 'Java Executable', extensions: ['*'] }]
    const file = await window.api.dialog.pickFile(filters)
    if (file) {
      setJavaPath(file)
      onChange({ javaPath: file })
    }
  }

  const ramOptions = [1024, 2048, 3072, 4096, 6144, 8192, 10240, 12288, 16384]

  const dgs = settings.defaultGameSettings
  const dgsEnabled = dgs !== undefined
  const setDgs = (patch: Partial<DefaultGameSettings>): void => {
    const next = { ...(dgs ?? {}), ...patch }
    for (const k of Object.keys(next)) {
      if ((next as Record<string, unknown>)[k] === undefined) delete (next as Record<string, unknown>)[k]
    }
    onChange({ defaultGameSettings: next })
  }

  return (
    <div>
      <SectionHeader>Java</SectionHeader>

      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-bright)' }}>Java executable path</div>
        <div className="flex gap-2">
          <input
            value={javaPath}
            onChange={(e) => setJavaPath(e.target.value)}
            onBlur={(e) => onChange({ javaPath: e.target.value || undefined })}
            placeholder="Auto-detect or set manually…"
            className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-bright)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.5)')}
            onBlurCapture={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={pickJava}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          >
            Browse
          </button>
          <button
            onClick={detectJava}
            disabled={detecting}
            className="px-3 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--accent-strong)', color: '#000' }}
          >
            {detecting ? 'Detecting…' : 'Auto-detect'}
          </button>
        </div>
        {detectMsg && (
          <p className="mt-2 text-xs" style={{ color: detectMsg.startsWith('Detected') ? 'var(--accent)' : 'var(--danger-soft)' }}>
            {detectMsg}
          </p>
        )}
        {javaInstalls.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>Detected installations:</p>
            {javaInstalls.map((j) => (
              <button
                key={j.path}
                onClick={() => { setJavaPath(j.path); onChange({ javaPath: j.path }) }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors"
                style={{
                  background: settings.javaPath === j.path ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface)',
                  border: `1px solid ${settings.javaPath === j.path ? 'rgba(var(--accent-rgb),0.2)' : 'var(--border-soft)'}`,
                  color: 'var(--text-soft)',
                }}
              >
                <span style={{ color: 'var(--text-bright)' }}>Java {j.major}</span>
                {j.vendor && <span style={{ color: 'var(--text-muted)' }}> · {j.vendor}</span>}
                <span className="block truncate mt-0.5" style={{ color: 'var(--text-faint)', fontFamily: 'monospace', fontSize: 10 }}>{j.path}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <SectionHeader>Memory</SectionHeader>

      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>Maximum RAM</div>
          <span
            className="text-sm font-bold px-2.5 py-0.5 rounded-lg"
            style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}
          >
            {settings.maxRamMb >= 1024 ? `${settings.maxRamMb / 1024} GB` : `${settings.maxRamMb} MB`}
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {ramOptions.map((mb) => (
            <button
              key={mb}
              onClick={() => onChange({ maxRamMb: mb })}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={
                settings.maxRamMb === mb
                  ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                  : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
              }
            >
              {mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-faint)' }}>
          Recommended: 4–8 GB for modpacks. Leave headroom for your OS.
        </p>
      </div>

      <SectionHeader>Directories</SectionHeader>

      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-bright)' }}>Instances directory</div>
        <div className="flex gap-2">
          <div
            className="flex-1 px-3 py-2 rounded-xl text-sm truncate"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: settings.instancesDir ? 'var(--text-bright)' : 'var(--text-faint)' }}
          >
            {settings.instancesDir ?? 'Default (app data folder)'}
          </div>
          <button
            onClick={pickDir}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          >
            Browse
          </button>
          {settings.instancesDir && (
            <button
              onClick={() => onChange({ instancesDir: undefined })}
              className="px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--danger-soft)', border: '1px solid var(--border)' }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <SectionHeader>Game</SectionHeader>

      <Row
        label="GregTech Hub"
        desc="Show the optional GregTech community addon catalog in the left sidebar"
      >
        <Toggle
          checked={!!settings.gregTechHubEnabled}
          onChange={(v) => onChange({ gregTechHubEnabled: v })}
        />
      </Row>

      <Row
        label="Use pack-recommended RAM"
        desc="When a modpack suggests a RAM amount, use that instead of the setting above"
      >
        <Toggle checked={!!settings.usePackRam} onChange={(v) => onChange({ usePackRam: v })} />
      </Row>

      <NoChatRow settings={settings} onChange={onChange} />

      <Row label="Discord Rich Presence" desc="Show what you're playing in Discord">
        <Toggle checked={!!settings.discordRpc} onChange={(v) => onChange({ discordRpc: v })} />
      </Row>

      <SectionHeader>New Instance Defaults</SectionHeader>

      <Row
        label="Set default video options"
        desc="Writes an options.txt on first launch of each new instance. Never overwrites existing settings."
      >
        <Toggle
          checked={dgsEnabled}
          onChange={(v) => onChange({ defaultGameSettings: v ? {} : undefined })}
        />
      </Row>

      {dgsEnabled && (
        <>
          {/* Render Distance */}
          <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>Render Distance</div>
              {dgs?.renderDistance !== undefined && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
                  {dgs.renderDistance} chunks
                </span>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {([undefined, 4, 6, 8, 10, 12, 16] as (number | undefined)[]).map((v) => {
                const active = dgs?.renderDistance === v
                return (
                  <button
                    key={v ?? 'default'}
                    onClick={() => setDgs({ renderDistance: dgs?.renderDistance === v ? undefined : v })}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                    style={active
                      ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                      : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
                    }
                  >
                    {v === undefined ? 'Default' : v}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Graphics */}
          <Row label="Graphics" desc="Fast improves performance; Fabulous adds screen-space effects (1.16+)">
            <div className="flex gap-1.5">
              {(['fast', 'fancy', 'fabulous'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setDgs({ graphics: dgs?.graphics === g ? undefined : g })}
                  className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                  style={dgs?.graphics === g
                    ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                    : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
                  }
                >
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </Row>

          {/* Particles */}
          <Row label="Particles">
            <div className="flex gap-1.5">
              {(['all', 'decreased', 'minimal'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setDgs({ particles: dgs?.particles === p ? undefined : p })}
                  className="px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all"
                  style={dgs?.particles === p
                    ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                    : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
                  }
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </Row>

          {/* FOV */}
          <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>FOV</div>
              {dgs?.fov !== undefined && (
                <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg" style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
                  {dgs.fov}°
                </span>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {([undefined, 60, 70, 80, 90, 100, 110] as (number | undefined)[]).map((v) => {
                const active = dgs?.fov === v
                return (
                  <button
                    key={v ?? 'default'}
                    onClick={() => setDgs({ fov: dgs?.fov === v ? undefined : v })}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                    style={active
                      ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                      : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
                    }
                  >
                    {v === undefined ? 'Default' : `${v}°`}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      <SectionHeader>Controls</SectionHeader>

      <ControlsSection settings={settings} onChange={onChange} />

      <SectionHeader>Updates</SectionHeader>

      <UpdateCheckRow />

      <Row
        label="Download updates automatically"
        desc="Fetch new versions silently in the background and only ask when it's time to restart. Turn this off to review and start downloads yourself, which can be useful on metered connections."
      >
        <Toggle
          checked={settings.autoDownloadUpdates !== false}
          onChange={(v) => onChange({ autoDownloadUpdates: v })}
        />
      </Row>

      <Row
        label="Receive beta updates"
        desc="Also offer prerelease (beta) builds, including early macOS & Linux releases. These may be less stable; please report issues on GitHub."
      >
        <Toggle checked={!!settings.betaUpdates} onChange={(v) => onChange({ betaUpdates: v })} />
      </Row>

      <SectionHeader>About</SectionHeader>

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>Website</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Visit the official Thendrask Launcher website.</div>
        </div>
        <button
          onClick={() => window.api.shell.openExternal('https://ender-client.xyz')}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}
        >
          ender-client.xyz
        </button>
      </div>

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>Report a Bug</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Found something wrong? Open an issue on GitHub.</div>
        </div>
        <button
          onClick={() => window.api.shell.openExternal('https://github.com/Sxarlos/ThendraskLauncher/issues/new')}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'rgba(var(--danger-rgb),0.10)', color: 'var(--danger-soft)', border: '1px solid rgba(var(--danger-rgb),0.25)' }}
        >
          Open issue
        </button>
      </div>

      <div
        className="mt-4 flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
        style={{ background: 'rgba(255,180,0,0.07)', border: '1px solid rgba(255,180,0,0.18)' }}
        onClick={() => window.api.shell.openExternal('https://buymeacoffee.com/sxarlos')}
      >
        <span style={{ fontSize: 18 }}>☕</span>
        <div className="min-w-0">
          <div className="text-xs font-semibold" style={{ color: '#f5c842' }}>Enjoying Thendrask Launcher?</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>If you'd like to support development, buying me a coffee goes a long way.</div>
        </div>
      </div>
    </div>
  )
}

/* ── Appearance tab ────────────────────────────────────── */
function AppearanceTab({ settings, onChange }: { settings: AppSettings; onChange: (patch: Partial<AppSettings>) => void }): JSX.Element {
  const setTheme = useApp((s) => s.setTheme)
  const setLiteMode = useApp((s) => s.setLiteMode)
  const currentTheme = normalizeThemeId(settings.theme)

  const applyTheme = (id: ThemeId): void => {
    setTheme(id)
    onChange({ theme: id })
  }

  return (
    <div>
      <SectionHeader>Theme</SectionHeader>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Pick a colour scheme for the launcher.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {THEMES.map((t) => {
          const active = currentTheme === t.id
          return (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              className="relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-200"
              style={{
                background: t.base,
                border: `1.5px solid ${active ? t.swatch : 'rgba(255,255,255,0.06)'}`,
                boxShadow: active ? `0 0 20px ${t.swatch}40, 0 4px 12px rgba(0,0,0,0.4)` : '0 2px 8px rgba(0,0,0,0.3)',
                transform: active ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              {/* Swatch blob */}
              <div
                className="absolute top-0 right-0 pointer-events-none"
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '0 16px 0 60px',
                  background: t.swatch,
                  opacity: 0.25,
                }}
              />
              {/* Active tick */}
              {active && (
                <div
                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: t.swatch }}
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              <div className="w-5 h-5 rounded-full mb-3 shrink-0" style={{ background: t.swatch, boxShadow: `0 0 10px ${t.swatch}60` }} />
              <div className="text-sm font-semibold leading-snug" style={{ color: t.base === '#f4f5f7' ? '#1a1d24' : '#e7e9ee' }}>
                {t.name}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: t.base === '#f4f5f7' ? '#6b7280' : 'rgba(255,255,255,0.35)' }}>
                {t.desc}
              </div>
            </button>
          )
        })}
      </div>

      <SectionHeader>Performance</SectionHeader>

      <Row
        label="Lite mode"
        desc="Strips visual effects (blur, shadows, animations, 3D skin viewer) for a snappier, lower-memory launcher. It also disables GPU hardware acceleration after restarting the launcher. Good for lower-end PCs."
      >
        <Toggle
          checked={!!settings.liteMode}
          onChange={(v) => {
            setLiteMode(v)
            onChange({ liteMode: v })
          }}
        />
      </Row>

      <Row
        label="Free memory while playing"
        desc="Closes the launcher window to the system tray while a game is running, cutting launcher RAM to a minimum. It reopens when the game exits or from the tray icon."
      >
        <Toggle
          checked={!!settings.trayWhilePlaying}
          onChange={(v) => onChange({ trayWhilePlaying: v })}
        />
      </Row>
    </div>
  )
}

/* ── API Keys tab ──────────────────────────────────────── */
function ApiKeysTab({ settings, onChange }: { settings: AppSettings; onChange: (patch: Partial<AppSettings>) => void }): JSX.Element {
  const [cfKey, setCfKey] = useState(settings.curseforgeApiKey ?? '')
  const [cfSaved, setCfSaved] = useState(false)
  const [relayUrl, setRelayUrl] = useState(settings.relayUrl ?? '')
  const [relaySaved, setRelaySaved] = useState(false)

  const saveCf = (): void => {
    onChange({ curseforgeApiKey: cfKey.trim() || undefined })
    setCfSaved(true)
    setTimeout(() => setCfSaved(false), 2000)
  }

  const saveRelay = (): void => {
    onChange({ relayUrl: relayUrl.trim() || undefined })
    setRelaySaved(true)
    setTimeout(() => setRelaySaved(false), 2000)
  }

  return (
    <div>
      <SectionHeader>CurseForge</SectionHeader>
      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-bright)' }}>CurseForge API Key</div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Required to browse CurseForge modpacks. Get a key at console.curseforge.com.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={cfKey}
            onChange={(e) => setCfKey(e.target.value)}
            placeholder="$2a$10$…"
            className="flex-1 px-3 py-2 rounded-xl text-sm outline-none font-mono"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-bright)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.5)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={saveCf}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: cfSaved ? 'rgba(var(--accent-rgb),0.15)' : 'var(--accent-strong)',
              color: cfSaved ? 'var(--accent)' : '#000',
            }}
          >
            {cfSaved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>

      <SectionHeader>Friends</SectionHeader>
      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-bright)' }}>Presence Relay URL</div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          URL of the hosted relay server that powers the friend list across different networks.
          Leave blank to disable friend presence.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.target.value)}
            placeholder="https://thendrask-relay-xxxx.onrender.com"
            className="flex-1 px-3 py-2 rounded-xl text-sm outline-none font-mono"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-bright)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.5)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={saveRelay}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: relaySaved ? 'rgba(var(--accent-rgb),0.15)' : 'var(--accent-strong)',
              color: relaySaved ? 'var(--accent)' : '#000',
            }}
          >
            {relaySaved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Settings page ────────────────────────────────── */
export default function Settings(): JSX.Element {
  const setGregTechHubEnabled = useApp((state) => state.setGregTechHubEnabled)
  const [tab, setTab] = useState<SettingsTab>('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.settings.get().then((s) => {
      setSettings(s)
      setLoading(false)
    })
  }, [])

  const handleChange = async (patch: Partial<AppSettings>): Promise<void> => {
    const next = await window.api.settings.set(patch)
    setSettings(next)
    if ('gregTechHubEnabled' in patch) setGregTechHubEnabled(!!next.gregTechHubEnabled)
  }

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'general',    label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'apikeys',    label: 'API Keys' },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tab bar */}
      <div
        className="shrink-0 flex gap-1 px-6 pt-1"
        style={{ borderBottom: '1px solid var(--border-soft)' }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="relative px-4 py-2.5 text-sm font-medium transition-colors duration-150"
            style={{ color: tab === t.id ? 'var(--text-strong)' : 'var(--text-muted)' }}
          >
            {tab === t.id && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)' }}
              />
            )}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-8">
        {loading || !settings ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-6 h-6 rounded-full border-2"
              style={{ borderColor: 'rgba(var(--accent-rgb),0.2)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }}
            />
          </div>
        ) : (
          <>
            {tab === 'general'    && <GeneralTab    settings={settings} onChange={handleChange} />}
            {tab === 'appearance' && <AppearanceTab settings={settings} onChange={handleChange} />}
            {tab === 'apikeys'    && <ApiKeysTab    settings={settings} onChange={handleChange} />}
          </>
        )}
      </div>
    </div>
  )
}
