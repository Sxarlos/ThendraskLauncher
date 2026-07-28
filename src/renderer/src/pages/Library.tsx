import { Component, useCallback, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type { Instance, InstanceSnapshot, InstanceStorageInfo, LocalMod, MissingCurseForgeFile, ModSearchResult, PackMod, PackOverview, PackVersion, VersionChangelog } from '@shared/types'
import { activeAccount, useApp } from '../store'
import { ipcError } from '../lib/ipcError'
import BrowseModpacks from './LibraryBrowse'
import MyInstancesContent from './LibraryInstances'
import { progressLabel } from './libraryUtils'

/* ════════════════════════════════════════════════
   Error boundary - catches render crashes in the detail panel
════════════════════════════════════════════════ */

class PanelErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; stack: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null, stack: '' }
  }
  static getDerivedStateFromError(e: Error) {
    return { error: e, stack: e.stack ?? '' }
  }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error('[PanelErrorBoundary] render crash:', e.message)
    console.error(e.stack)
    console.error('Component stack:', info.componentStack)
  }
  render() {
    if (this.state.error) {
      const msg = this.state.error.message
      const stack = this.state.stack.split('\n').slice(0, 6).join('\n')
      return (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, textAlign: 'center',
          background: 'var(--bg)', overflowY: 'auto'
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--danger)' }}>
            Panel render error - check DevTools console (F12) for full details
          </p>
          <p style={{
            fontSize: 12, fontFamily: 'monospace', padding: '8px 14px', borderRadius: 8,
            maxWidth: 520, wordBreak: 'break-all', textAlign: 'left',
            background: 'rgba(0,0,0,0.4)', color: '#ff9999', whiteSpace: 'pre-wrap'
          }}>
            {msg}
          </p>
          {stack && (
            <p style={{
              fontSize: 10, fontFamily: 'monospace', padding: '6px 12px', borderRadius: 8,
              maxWidth: 520, wordBreak: 'break-all', textAlign: 'left',
              background: 'rgba(0,0,0,0.3)', color: 'var(--text-muted)', whiteSpace: 'pre-wrap'
            }}>
              {stack}
            </p>
          )}
          <button
            onClick={() => this.setState({ error: null, stack: '' })}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: 'var(--surface-2)', color: 'var(--text-soft)', border: 'none', cursor: 'pointer'
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/* ════════════════════════════════════════════════
   Instance detail - Mods sub-components
════════════════════════════════════════════════ */

function ModGroup({ label, mods }: { label: string; mods: PackMod[] }): JSX.Element {
  return (
    <div>
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {mods.map((mod, i) => (
          <button
            key={mod.projectId ?? `${mod.name}:${i}`}
            type="button"
            onClick={() => mod.externalUrl && window.api.shell.openExternal(mod.externalUrl)}
            disabled={!mod.externalUrl}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors disabled:cursor-default"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
            title={mod.externalUrl ? `Open ${mod.name} on ${mod.source === 'curseforge' ? 'CurseForge' : 'Modrinth'}` : undefined}
          >
            <div
              className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-xl"
              style={{ background: 'var(--surface-2)' }}
            >
              {mod.iconUrl ? (
                <img
                  src={mod.iconUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                '🔧'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium truncate"
                style={{ color: 'var(--text-bright)' }}
              >
                {mod.name}
              </div>
              {mod.optional && (
                <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  Optional
                </div>
              )}
              {mod.serverOnly && (
                <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  Server only
                </div>
              )}
            </div>
            {mod.externalUrl && (
              <span className="text-xs shrink-0" style={{ color: 'var(--text-faint)' }} aria-hidden="true">↗</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function ModsTabContent({
  mods,
  loading,
  loaded,
  error
}: {
  mods: PackMod[]
  loading: boolean
  loaded: boolean
  error: string | null
}): JSX.Element {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
          >
            <div className="w-10 h-10 rounded-lg shrink-0 skeleton" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded skeleton w-3/4" />
              <div className="h-2.5 rounded skeleton w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-3xl mb-3">⚠️</div>
        <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
          Failed to load mods
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {error}
        </p>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20"
        style={{ color: 'var(--text-dim)' }}
      >
        <div className="text-4xl mb-3">📦</div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Loading mod list…
        </p>
      </div>
    )
  }

  if (mods.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        style={{ color: 'var(--text-dim)' }}
      >
        <div className="text-4xl mb-3">📦</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          No mods found
        </p>
        <p className="text-xs mt-1">
          This may be a vanilla modpack or the manifest was unavailable.
        </p>
      </div>
    )
  }

  const required = mods.filter((m) => !m.optional && !m.serverOnly)
  const optional = mods.filter((m) => m.optional)
  const serverOnly = mods.filter((m) => m.serverOnly)

  return (
    <div className="space-y-6">
      {required.length > 0 && (
        <ModGroup label={`Included Mods (${required.length})`} mods={required} />
      )}
      {optional.length > 0 && (
        <ModGroup label={`Optional (${optional.length})`} mods={optional} />
      )}
      {serverOnly.length > 0 && (
        <ModGroup label={`Server Only (${serverOnly.length})`} mods={serverOnly} />
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════
   Instance detail - Versions sub-component
════════════════════════════════════════════════ */

function VersionsTabContent({
  instance,
  versions,
  loading,
  error,
  switching,
  onSwitch,
  hasUpdate,
  latestVersion
}: {
  instance: Instance
  versions: PackVersion[]
  loading: boolean
  error: string | null
  switching: string | null
  onSwitch: (id: string) => void
  hasUpdate: boolean
  latestVersion?: PackVersion
}): JSX.Element {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl skeleton" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
          Failed to load versions
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {error}
        </p>
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-dim)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No versions found.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {hasUpdate && latestVersion && (
        <div
          className="flex items-center justify-between gap-4 p-4 rounded-xl mb-4"
          style={{
            background: 'rgba(var(--warning-rgb),0.08)',
            border: '1px solid rgba(var(--warning-rgb),0.25)'
          }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--warning)' }}>
              Update available
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {latestVersion.name || latestVersion.versionNumber} is now available
            </p>
          </div>
          <button
            onClick={() => onSwitch(latestVersion.id)}
            disabled={!!switching}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-black shrink-0 disabled:opacity-50"
            style={{ background: 'var(--warning)' }}
          >
            {switching === latestVersion.id ? 'Updating…' : 'Update now'}
          </button>
        </div>
      )}

      {versions.map((v) => {
        const isCurrent = v.id === instance.packVersionId
        const isLatest = v.id === versions[0].id

        return (
          <div
            key={v.id}
            className="flex items-center gap-4 p-4 rounded-xl"
            style={{
              background: isCurrent ? 'rgba(var(--accent-rgb),0.06)' : 'var(--surface)',
              border: `1px solid ${isCurrent ? 'rgba(var(--accent-rgb),0.2)' : 'var(--border-soft)'}`
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>
                  {v.name || v.versionNumber}
                </span>
                {isCurrent && (
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      background: 'rgba(var(--accent-rgb),0.15)',
                      color: 'var(--accent)'
                    }}
                  >
                    Installed
                  </span>
                )}
                {isLatest && !isCurrent && (
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(var(--accent-rgb),0.08)',
                      color: 'var(--accent)'
                    }}
                  >
                    Latest
                  </span>
                )}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {v.gameVersions[0] && `MC ${v.gameVersions[0]}`}
                {v.loaders[0] && ` · ${v.loaders[0]}`}
                {v.datePublished &&
                  ` · ${new Date(v.datePublished).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`}
              </div>
            </div>

            {!isCurrent && (
              <button
                onClick={() => onSwitch(v.id)}
                disabled={!!switching}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0 disabled:opacity-50"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-soft)',
                  border: '1px solid var(--border)'
                }}
                onMouseEnter={(e) => {
                  if (!switching) {
                    e.currentTarget.style.background = 'var(--surface-3)'
                    e.currentTarget.style.color = 'var(--text-bright)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--surface-2)'
                  e.currentTarget.style.color = 'var(--text-soft)'
                }}
              >
                {switching === v.id ? 'Switching…' : 'Switch to'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ════════════════════════════════════════════════
   Instance detail - Console tab
════════════════════════════════════════════════ */

function logLineStyle(line: string): string {
  if (/\/ERROR]|[ERROR]/.test(line)) return '#ff6b6b'
  if (/\/WARN]|[WARN]/.test(line)) return '#ffd93d'
  if (/\[Launcher]/.test(line)) return 'var(--text-muted)'
  return '#a8c4a8'
}

function ConsoleTabContent({
  logs,
  running
}: {
  logs: string[]
  running: boolean
}): JSX.Element {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [logs.length])

  if (logs.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-center"
        style={{ color: 'var(--text-dim)' }}
      >
        <div className="text-4xl mb-3">📋</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          {running ? 'Waiting for output…' : 'No logs yet'}
        </p>
        <p className="text-xs mt-1">Console output appears here when the game is running.</p>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl font-mono text-xs leading-relaxed p-4"
      style={{
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid var(--border-soft)',
        minHeight: 300
      }}
    >
      {logs.map((line, i) => (
        <div
          key={i}
          className="whitespace-pre-wrap break-all py-px"
          style={{ color: logLineStyle(line) }}
        >
          {line}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

/* ════════════════════════════════════════════════
   Instance detail panel
════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════
   Instance detail - Overview tab
════════════════════════════════════════════════ */

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+(.+)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^>\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function OverviewTabContent({
  instance,
  overview,
  loading,
  error
}: {
  instance: Instance
  overview: PackOverview | null
  loading: boolean
  error: string | null
}): JSX.Element {
  const [activeImg, setActiveImg] = useState(0)
  const screenshots = overview?.screenshotUrls ?? instance.screenshotUrls ?? []

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-48 rounded-2xl skeleton" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 rounded skeleton" style={{ width: `${70 + (i % 3) * 10}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-3xl mb-3">⚠️</div>
        <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Failed to load overview</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{error}</p>
      </div>
    )
  }

  const description = overview ? stripMarkdown(overview.description) : ''

  return (
    <div className="space-y-6">
      {/* Screenshot gallery */}
      {screenshots.length > 0 && (
        <div className="space-y-2">
          {/* Main image */}
          <div
            className="w-full rounded-2xl overflow-hidden"
            style={{ aspectRatio: '16/9', background: 'var(--surface)' }}
          >
            <img
              src={screenshots[activeImg]}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          {/* Thumbnail strip */}
          {screenshots.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {screenshots.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className="shrink-0 rounded-xl overflow-hidden transition-all"
                  style={{
                    width: 72,
                    height: 48,
                    border: `2px solid ${i === activeImg ? 'var(--accent)' : 'transparent'}`,
                    opacity: i === activeImg ? 1 : 0.55,
                  }}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-3">
        {overview?.author && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            <span style={{ color: 'var(--text-soft)' }}>{overview.author}</span>
          </div>
        )}
        {overview?.downloads != null && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v13m0 0l-4-4m4 4l4-4"/><path d="M4 17v3h16v-3"/>
            </svg>
            <span style={{ color: 'var(--text-soft)' }}>{fmtNumber(overview.downloads)} downloads</span>
          </div>
        )}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
        >
          <span style={{ color: 'var(--text-faint)' }}>MC</span>
          <span style={{ color: 'var(--text-soft)' }}>{instance.mcVersion}</span>
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs capitalize"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', color: 'var(--text-soft)' }}
        >
          {instance.loader}
        </div>
      </div>

      {/* Description */}
      {description ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
            About
          </h3>
          <div
            className="text-sm leading-relaxed whitespace-pre-wrap rounded-xl px-4 py-4"
            style={{
              color: 'var(--text-soft)',
              background: 'var(--surface)',
              border: '1px solid var(--border-soft)',
              maxHeight: 320,
              overflowY: 'auto'
            }}
          >
            {description}
          </div>
        </div>
      ) : !loading && (
        <div className="flex flex-col items-center justify-center py-10 text-center" style={{ color: 'var(--text-dim)' }}>
          <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No description available.</p>
        </div>
      )}

      {/* External link */}
      {overview?.externalUrl && (
        <a
          href={overview.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-bright)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-soft)' }}
        >
          View on {instance.source === 'modrinth' ? 'Modrinth' : instance.source === 'ftb' || instance.source === 'ftb-legacy' ? 'FTB' : instance.source === 'atlauncher' ? 'ATLauncher' : instance.source === 'technic' ? 'Technic' : 'CurseForge'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════
   Instance detail - Changelog tab
════════════════════════════════════════════════ */

function ChangelogTabContent({
  changelogs,
  loading,
  error,
  currentVersionId
}: {
  changelogs: VersionChangelog[]
  loading: boolean
  error: string | null
  currentVersionId?: string
}): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)' }}>
            <div className="flex items-center gap-3 p-4">
              <div className="h-3 rounded skeleton w-24" />
              <div className="h-2.5 rounded skeleton w-16" />
              <div className="h-2.5 rounded skeleton w-20 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-3xl mb-3">⚠️</div>
        <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Failed to load changelog</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{error}</p>
      </div>
    )
  }

  if (changelogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: 'var(--text-dim)' }}>
        <div className="text-4xl mb-3">📋</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No changelog available</p>
        <p className="text-xs mt-1">The author hasn't published release notes for this modpack.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {changelogs.map((entry) => {
        const isExpanded = expanded.has(entry.id)
        const isCurrent = entry.id === currentVersionId
        const hasNotes = entry.changelog.length > 0
        const date = entry.datePublished
          ? new Date(entry.datePublished).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : null

        return (
          <div
            key={entry.id}
            className="rounded-xl overflow-hidden transition-all"
            style={{
              border: `1px solid ${isCurrent ? 'rgba(var(--accent-rgb),0.25)' : 'var(--border-soft)'}`,
              background: isCurrent ? 'rgba(var(--accent-rgb),0.04)' : 'var(--surface)',
            }}
          >
            {/* Header row - always visible, clickable to expand */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              onClick={() => hasNotes && toggle(entry.id)}
              style={{ cursor: hasNotes ? 'pointer' : 'default' }}
            >
              {/* Expand chevron */}
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="shrink-0 transition-transform duration-200"
                style={{
                  color: 'var(--text-faint)',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  opacity: hasNotes ? 1 : 0.3
                }}
              >
                <path d="M9 18l6-6-6-6"/>
              </svg>

              {/* Version name */}
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-bright)' }}>
                {entry.name || entry.versionNumber}
              </span>

              {/* Current badge */}
              {isCurrent && (
                <span
                  className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}
                >
                  Installed
                </span>
              )}

              {/* No notes label */}
              {!hasNotes && (
                <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  No notes
                </span>
              )}

              {/* Date */}
              {date && (
                <span className="ml-auto shrink-0 text-xs" style={{ color: 'var(--text-faint)' }}>
                  {date}
                </span>
              )}
            </button>

            {/* Changelog body */}
            {isExpanded && hasNotes && (
              <div
                className="px-4 pb-4 text-sm leading-relaxed whitespace-pre-wrap"
                style={{
                  color: 'var(--text-soft)',
                  borderTop: '1px solid var(--border-soft)',
                  paddingTop: 12,
                  fontFamily: 'inherit'
                }}
              >
                {stripMarkdown(entry.changelog)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ════════════════════════════════════════════════
   Instance detail - Settings tab
════════════════════════════════════════════════ */

function InstanceSettingsTab({
  instance,
  onUpdated
}: {
  instance: Instance
  onUpdated: () => void
}): JSX.Element {
  const [name, setName] = useState(instance.name)
  const [nameSaved, setNameSaved] = useState(false)
  const [ramMb, setRamMb] = useState<number | ''>(instance.recommendedRamMb ?? '')
  const [ramSaved, setRamSaved] = useState(false)
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs ?? '')
  const [jvmSaved, setJvmSaved] = useState(false)
  const [group, setGroup] = useState(instance.group ?? '')
  const [tags, setTags] = useState((instance.tags ?? []).join(', '))
  const [snapshots, setSnapshots] = useState<InstanceSnapshot[]>([])
  const [storage, setStorage] = useState<InstanceStorageInfo | null>(null)
  const [maintenanceBusy, setMaintenanceBusy] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const setError = useApp((s) => s.setError)

  const loadMaintenance = useCallback(async (): Promise<void> => {
    const [nextSnapshots, nextStorage] = await Promise.all([
      window.api.instance.snapshots(instance.id),
      window.api.instance.storage(instance.id)
    ])
    setSnapshots(nextSnapshots)
    setStorage(nextStorage)
  }, [instance.id])

  useEffect(() => {
    // Async IPC hydration for this instance's maintenance panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMaintenance().catch((e) => setError(ipcError(e)))
  }, [loadMaintenance, setError])

  const saveName = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === instance.name) return
    try {
      await (window.api as any).instances?.update?.(instance.id, { name: trimmed })
      onUpdated()
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename')
    }
  }

  const saveRam = async (mb: number | ''): Promise<void> => {
    const value = mb === '' ? undefined : Number(mb)
    try {
      await (window.api as any).instances?.update?.(instance.id, { recommendedRamMb: value })
      onUpdated()
      setRamSaved(true)
      setTimeout(() => setRamSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save RAM')
    }
  }

  const saveJvmArgs = async (): Promise<void> => {
    try {
      await (window.api as any).instances?.update?.(instance.id, { jvmArgs: jvmArgs.trim() || undefined })
      onUpdated()
      setJvmSaved(true)
      setTimeout(() => setJvmSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save JVM args')
    }
  }

  const saveOrganisation = async (): Promise<void> => {
    try {
      await window.api.instances.update(instance.id, {
        group: group.trim() || undefined,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 20)
      })
      await onUpdated()
      setMaintenanceMessage('Organisation saved.')
    } catch (e) {
      setError(ipcError(e))
    }
  }

  const openDir = (): void => {
    ;(window.api as any).instance?.openDir?.(instance.id)
  }

  const runMaintenance = async (action: () => Promise<void>): Promise<void> => {
    setMaintenanceBusy(true)
    setMaintenanceMessage('')
    try {
      await action()
      await loadMaintenance()
    } catch (e) {
      setError(ipcError(e))
    } finally {
      setMaintenanceBusy(false)
    }
  }

  const makeSnapshot = (): void => {
    void runMaintenance(async () => {
      await window.api.instance.createSnapshot(instance.id)
      setMaintenanceMessage('Snapshot created.')
    })
  }

  const repair = (): void => {
    if (!window.confirm('Create a safety snapshot and prepare this instance for repair on its next launch?')) return
    void runMaintenance(async () => {
      const result = await window.api.instance.repair(instance.id)
      setMaintenanceMessage(
        `${result.removedBrokenFiles} broken file(s) removed.${result.reinstallScheduled ? ' The modpack will be reinstalled on next launch.' : ''}`
      )
    })
  }

  const diagnostics = (): void => {
    void runMaintenance(async () => {
      const path = await window.api.instance.diagnostics(instance.id)
      setMaintenanceMessage(`Diagnostic bundle created: ${path}`)
    })
  }

  const exportBackup = (): void => {
    void runMaintenance(async () => {
      const path = await window.api.instance.exportBackup(instance.id)
      setMaintenanceMessage(`Portable backup created: ${path}`)
    })
  }

  const RAM_OPTIONS = [1024, 2048, 3072, 4096, 6144, 8192, 10240, 12288, 16384]

  return (
    <div className="space-y-1">

      {/* ── General ──────────────────────────────────── */}
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] pt-2 pb-1" style={{ color: 'var(--text-faint)' }}>General</div>

      {/* Name */}
      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-bright)' }}>Instance name</div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setNameSaved(false) }}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-bright)' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.5)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={saveName}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: nameSaved ? 'rgba(var(--accent-rgb),0.15)' : 'var(--accent-strong)',
              color: nameSaved ? 'var(--accent)' : '#000',
            }}
          >
            {nameSaved ? 'Saved ✓' : 'Rename'}
          </button>
        </div>
      </div>

      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-bright)' }}>Group and tags</div>
        <div className="grid grid-cols-2 gap-2">
          <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Group, e.g. SMP" className="px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-bright)' }} />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" className="px-3 py-2 rounded-xl text-sm outline-none" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-bright)' }} />
        </div>
        <button onClick={saveOrganisation} className="mt-2 px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>Save organisation</button>
      </div>

      {/* Info row */}
      <div className="flex gap-4 py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="flex-1">
          <div className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>Loader</div>
          <div className="text-sm font-medium capitalize" style={{ color: 'var(--text-bright)' }}>{instance.loader}</div>
        </div>
        <div className="flex-1">
          <div className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>Minecraft version</div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>{instance.mcVersion}</div>
        </div>
        {instance.source && instance.source !== 'manual' && (
          <div className="flex-1">
            <div className="text-xs mb-1" style={{ color: 'var(--text-faint)' }}>Source</div>
            <div className="text-sm font-medium capitalize" style={{ color: 'var(--text-bright)' }}>{instance.source}</div>
          </div>
        )}
      </div>

      {/* ── Performance ──────────────────────────────── */}
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] pt-5 pb-1" style={{ color: 'var(--text-faint)' }}>Performance</div>

      {/* RAM */}
      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>RAM override</div>
          <span
            className="text-sm font-bold px-2.5 py-0.5 rounded-lg"
            style={{ background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}
          >
            {ramMb ? (Number(ramMb) >= 1024 ? `${Number(ramMb) / 1024} GB` : `${ramMb} MB`) : 'Use global'}
          </span>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Overrides the global RAM setting just for this instance. Clear to use the global default.
        </p>
        <div className="flex gap-1.5 flex-wrap mb-3">
          <button
            onClick={() => { setRamMb(''); saveRam('') }}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={
              ramMb === ''
                ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
            }
          >
            Global
          </button>
          {RAM_OPTIONS.map((mb) => (
            <button
              key={mb}
              onClick={() => { setRamMb(mb); saveRam(mb); setRamSaved(false) }}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={
                ramMb === mb
                  ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                  : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
              }
            >
              {mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`}
            </button>
          ))}
        </div>
        {ramSaved && (
          <p className="text-xs" style={{ color: 'var(--accent)' }}>✓ Saved</p>
        )}
      </div>

      {/* ── Java Arguments ───────────────────────────── */}
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] pt-5 pb-1" style={{ color: 'var(--text-faint)' }}>Java Arguments</div>

      <div className="py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-bright)' }}>Extra JVM flags</div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Additional arguments passed to Java when launching this instance. One flag per line or space-separated. Applied after the global defaults.
        </p>
        <textarea
          value={jvmArgs}
          onChange={(e) => { setJvmArgs(e.target.value); setJvmSaved(false) }}
          placeholder={'-XX:+UseG1GC\n-XX:+ParallelRefProcEnabled\n-XX:MaxGCPauseMillis=200'}
          rows={5}
          className="w-full px-3 py-2.5 rounded-xl text-xs font-mono outline-none resize-none"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-bright)',
            lineHeight: 1.6,
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.5)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />

        {/* Preset chips */}
        <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
          {[
            { label: 'G1GC', args: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC' },
            { label: 'ZGC', args: '-XX:+UseZGC' },
            { label: 'Aikar\'s flags', args: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1' },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => { setJvmArgs(preset.args); setJvmSaved(false) }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
              style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-soft)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-muted)' }}
              title={preset.args}
            >
              {preset.label}
            </button>
          ))}
          {jvmArgs && (
            <button
              onClick={() => { setJvmArgs(''); setJvmSaved(false) }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
              style={{ color: 'var(--danger-soft)', border: '1px solid rgba(var(--danger-rgb),0.2)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(var(--danger-rgb),0.08)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Clear
            </button>
          )}
        </div>

        <button
          onClick={saveJvmArgs}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: jvmSaved ? 'rgba(var(--accent-rgb),0.15)' : 'var(--accent-strong)',
            color: jvmSaved ? 'var(--accent)' : '#000',
          }}
        >
          {jvmSaved ? 'Saved ✓' : 'Save arguments'}
        </button>
      </div>

      {/* ── Maintenance ──────────────────────────────── */}
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] pt-5 pb-1" style={{ color: 'var(--text-faint)' }}>Maintenance & backups</div>
      <div className="py-4 space-y-3" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        {storage && (
          <div className="grid grid-cols-4 gap-2">
            {[
              ['Total', storage.totalBytes],
              ['Mods', storage.modsBytes],
              ['Saves', storage.savesBytes],
              ['Snapshots', storage.snapshotsBytes]
            ].map(([label, bytes]) => (
              <div key={String(label)} className="rounded-xl p-2.5" style={{ background: 'var(--surface-2)' }}>
                <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{label}</div>
                <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--text-bright)' }}>{fmtBytes(Number(bytes))}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button disabled={maintenanceBusy} onClick={makeSnapshot} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent-strong)', color: '#000' }}>Create snapshot</button>
          <button disabled={maintenanceBusy} onClick={repair} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}>Verify & repair</button>
          <button disabled={maintenanceBusy} onClick={diagnostics} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}>Export diagnostics</button>
          <button disabled={maintenanceBusy} onClick={exportBackup} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}>Export portable backup</button>
        </div>
        {maintenanceMessage && <p className="text-xs break-all" style={{ color: 'var(--accent)' }}>{maintenanceMessage}</p>}
        {snapshots.length > 0 && (
          <div className="space-y-1.5">
            {snapshots.map((snapshot) => (
              <div key={snapshot.id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--text-bright)' }}>{snapshot.label}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{new Date(snapshot.createdAt).toLocaleString()} · {fmtBytes(snapshot.sizeBytes)}</div>
                </div>
                <button
                  disabled={maintenanceBusy}
                  onClick={() => {
                    if (!window.confirm('Restore this snapshot? Current pack files will be replaced.')) return
                    void runMaintenance(async () => {
                      await window.api.instance.restoreSnapshot(instance.id, snapshot.id)
                      setMaintenanceMessage('Snapshot restored.')
                    })
                  }}
                  className="text-[11px] px-2 py-1 rounded-lg disabled:opacity-50"
                  style={{ color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}
                >Restore</button>
                <button
                  disabled={maintenanceBusy}
                  onClick={() => void runMaintenance(async () => { await window.api.instance.deleteSnapshot(instance.id, snapshot.id) })}
                  className="text-[11px] px-2 py-1 rounded-lg disabled:opacity-50"
                  style={{ color: 'var(--danger-soft)' }}
                >Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Files ────────────────────────────────────── */}
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] pt-5 pb-1" style={{ color: 'var(--text-faint)' }}>Files</div>

      <div className="flex items-center justify-between py-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-bright)' }}>Game directory</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Open the .minecraft folder for this instance</div>
        </div>
        <button
          onClick={openDir}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-bright)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-soft)' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          Open folder
        </button>
      </div>
    </div>
  )
}

function fmtBytes(b: number): string {
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`
  if (b >= 1_024) return `${(b / 1_024).toFixed(0)} KB`
  return `${b} B`
}

function MissingCurseForgeChecklist({
  instanceId,
  files,
  onFilesChanged
}: {
  instanceId: string
  files: MissingCurseForgeFile[]
  onFilesChanged: (files: MissingCurseForgeFile[]) => void
}): JSX.Element {
  const [importingKey, setImportingKey] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ key: string; message: string } | null>(null)

  const importJar = async (file: MissingCurseForgeFile): Promise<void> => {
    const key = `${file.projectId}:${file.fileId}`
    const sourcePath = await window.api.dialog.pickFile([{ name: 'Mod JAR', extensions: ['jar'] }])
    if (!sourcePath) return
    setImportingKey(key)
    setRowError(null)
    try {
      const updated = await window.api.instance.importMissingCurseForgeMod(
        instanceId,
        sourcePath,
        file.projectId,
        file.fileId,
        file.fileName
      )
      onFilesChanged(updated)
    } catch (error) {
      setRowError({ key, message: ipcError(error) })
    } finally {
      setImportingKey(null)
    }
  }

  if (!files.length) {
    return (
      <div
        className="rounded-2xl px-5 py-10 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
      >
        <div className="text-3xl mb-2" style={{ color: '#4ade80' }}>✓</div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-bright)' }}>No manual files are required</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>CurseForge allowed the whole pack to be downloaded automatically.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {files.map((file) => {
        const key = `${file.projectId}:${file.fileId}`
        const imported = !!file.importedFileName
        const importing = importingKey === key
        return (
          <div
            key={key}
            className="rounded-xl px-3 py-3"
            style={{
              background: imported ? 'rgba(74,222,128,0.07)' : 'var(--surface-2)',
              border: `1px solid ${imported ? 'rgba(74,222,128,0.32)' : 'var(--border-soft)'}`
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm font-black"
                style={{
                  background: imported ? 'rgba(74,222,128,0.17)' : 'var(--surface)',
                  color: imported ? '#4ade80' : 'var(--text-faint)',
                  border: `1px solid ${imported ? 'rgba(74,222,128,0.3)' : 'var(--border-soft)'}`
                }}
                aria-label={imported ? 'Imported' : 'Waiting for import'}
              >
                {imported ? '✓' : '↓'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-bright)' }} title={file.displayName}>
                  {file.displayName}
                </div>
                <div className="text-[10px] mt-1 truncate" style={{ color: imported ? '#4ade80' : 'var(--text-muted)' }} title={file.fileName}>
                  {imported
                    ? `Imported as ${file.importedFileName}`
                    : file.fileName ?? `CurseForge project ${file.projectId} · file ${file.fileId}`}
                </div>
              </div>
              <button
                onClick={() => file.filePageUrl && window.api.shell.openExternal(file.filePageUrl)}
                disabled={!file.filePageUrl}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-40"
                style={{ background: 'var(--surface)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.25)' }}
                title={file.filePageUrl ? 'Open the official CurseForge file page' : 'CurseForge page unavailable'}
              >
                Download
              </button>
              <button
                onClick={() => void importJar(file)}
                disabled={importing || imported}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-55"
                style={{
                  background: imported ? 'rgba(74,222,128,0.15)' : 'var(--accent-strong)',
                  color: imported ? '#4ade80' : '#000',
                  border: imported ? '1px solid rgba(74,222,128,0.28)' : '1px solid transparent'
                }}
              >
                {imported ? '✓ Imported' : importing ? 'Importing…' : 'Import JAR'}
              </button>
            </div>
            {rowError?.key === key && (
              <p className="text-[11px] mt-2 ml-10" style={{ color: 'var(--danger-soft)' }}>{rowError.message}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function InstanceDetailPanel({
  instance,
  onBack
}: {
  instance: Instance
  onBack: () => void
}): JSX.Element {
  const [detailTab, setDetailTab] = useState<'overview' | 'changelog' | 'mods' | 'manual' | 'versions' | 'console' | 'settings'>(
    instance.externalId && instance.source !== 'manual' ? 'overview' : instance.loader !== 'vanilla' ? 'mods' : 'settings'
  )
  const [versions, setVersions] = useState<PackVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(
    () => !!instance.externalId && instance.source !== 'manual'
  )
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [mods, setMods] = useState<PackMod[]>([])
  const [modsLoading, setModsLoading] = useState(false)
  const [modsLoaded, setModsLoaded] = useState(false)
  const [modsError, setModsError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [localMods, setLocalMods] = useState<LocalMod[]>([])
  const [managedMods, setManagedMods] = useState<LocalMod[]>([])
  const [modSource, setModSource] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [modQuery, setModQuery] = useState('')
  const [modResults, setModResults] = useState<ModSearchResult[]>([])
  const [modSearching, setModSearching] = useState(false)
  const [installingProject, setInstallingProject] = useState<string | null>(null)
  const [updatingCustomMods, setUpdatingCustomMods] = useState(false)
  const [addingMod, setAddingMod] = useState(false)
  const [overview, setOverview] = useState<PackOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [changelogs, setChangelogs] = useState<VersionChangelog[]>([])
  const [changelogLoading, setChangelogLoading] = useState(false)
  const [changelogError, setChangelogError] = useState<string | null>(null)
  const [changelogLoaded, setChangelogLoaded] = useState(false)
  const [missingCurseForgeFiles, setMissingCurseForgeFiles] = useState<MissingCurseForgeFile[]>([])
  const identifiedLocalModNames = useRef(new Set<string>())

  const refreshInstances = useApp((s) => s.refreshInstances)
  const accounts = useApp((s) => s.accounts)
  const progress = useApp((s) => s.progress[instance.id])
  const logs = useApp((s) => s.logs[instance.id]) ?? []
  const setError = useApp((s) => s.setError)

  const signedIn = !!activeAccount(accounts)
  const busy = progress && ['preparing', 'downloading', 'launching'].includes(progress.state)
  const running = progress?.state === 'running'
  const hasModSource = !!instance.externalId && instance.source !== 'manual'
  const remainingManualFiles = missingCurseForgeFiles.filter((file) => !file.importedFileName).length
  const packFileNames = new Set(
    mods.map((mod) => mod.fileName?.toLowerCase()).filter((name): name is string => !!name)
  )
  const packProjectIds = new Set(
    mods.map((mod) => mod.projectId).filter((id): id is string => !!id)
  )
  const localAdditions = localMods.filter(
    (mod) => !hasModSource
      || (modsLoaded && (!!modsError
        || !packFileNames.has(mod.name.replace(/\.disabled$/i, '').toLowerCase())))
  )
  const managedAdditions = managedMods.filter(
    (mod) => !hasModSource
      || (modsLoaded && (!!modsError || !mod.projectId || !packProjectIds.has(mod.projectId)))
  )
  const uniqueModCount = mods.length + localAdditions.length + managedAdditions.length

  const latestVersion = versions[0]
  const hasUpdate =
    !!latestVersion && !!instance.packVersionId && latestVersion.id !== instance.packVersionId

  // Fetch versions on mount
  useEffect(() => {
    if (!hasModSource) return
    const initialLoad = setTimeout(() => {
      const modpackApi = (window.api as any).modpack
      if (!modpackApi) {
        setVersionsError('Restart the app to enable modpack features.')
        setVersionsLoading(false)
        return
      }
      setVersionsLoading(true)
      setVersionsError(null)
      modpackApi
        .versions(instance.id)
        .then(setVersions)
        .catch((e: unknown) => setVersionsError(e instanceof Error ? e.message : 'Failed to load versions'))
        .finally(() => setVersionsLoading(false))
    }, 0)
    return () => clearTimeout(initialLoad)
  }, [instance.id, hasModSource])

  useEffect(() => {
    window.api.modpack.missingCurseForgeFiles(instance.id)
      .then(async (files) => {
        setMissingCurseForgeFiles(files)
        if (files.length && instance.source === 'manual') {
          const enriched = await window.api.modpack.enrichCurseForgeImport(instance.id)
          if (enriched?.source === 'curseforge') await refreshInstances()
        }
      })
      .catch(() => setMissingCurseForgeFiles([]))
  }, [instance.id, instance.source, refreshInstances])

  // Fetch changelog when Changelog tab is first opened
  useEffect(() => {
    if (detailTab !== 'changelog' || changelogLoaded || changelogLoading || !hasModSource) return
    const loadRequest = setTimeout(() => {
      setChangelogLoading(true)
      setChangelogError(null)
      ;((window.api as any).modpack?.changelog?.(instance.id) ?? Promise.resolve([]))
        .then((data: VersionChangelog[]) => { setChangelogs(data); setChangelogLoaded(true) })
        .catch((e: unknown) => { setChangelogError(e instanceof Error ? e.message : 'Failed to load changelog'); setChangelogLoaded(true) })
        .finally(() => setChangelogLoading(false))
    }, 0)
    return () => clearTimeout(loadRequest)
  }, [detailTab, changelogLoaded, changelogLoading, instance.id, hasModSource])

  // Fetch overview when Overview tab is first opened
  useEffect(() => {
    if (detailTab !== 'overview' || overview || overviewLoading || !hasModSource) return
    const loadRequest = setTimeout(() => {
      setOverviewLoading(true)
      setOverviewError(null)
      ;((window.api as any).modpack?.overview?.(instance.id) ?? Promise.resolve(null))
        .then((data: PackOverview | null) => setOverview(data))
        .catch((e: unknown) => setOverviewError(e instanceof Error ? e.message : 'Failed to load overview'))
        .finally(() => setOverviewLoading(false))
    }, 0)
    return () => clearTimeout(loadRequest)
  }, [detailTab, overview, overviewLoading, instance.id, hasModSource])

  // Fetch local mods whenever the Mods tab is active
  useEffect(() => {
    if (detailTab !== 'mods') return
    Promise.all([
      window.api.instance.listLocalMods(instance.id),
      window.api.customMods.list(instance.id)
    ]).then(([local, managed]) => {
      setLocalMods(local)
      setManagedMods(managed)
    })
      .catch(() => {})
  }, [detailTab, instance.id])

  useEffect(() => {
    if (detailTab !== 'mods' || !modsLoaded) return
    const unresolved = localAdditions
      .filter((mod) => !mod.externalUrl && !identifiedLocalModNames.current.has(mod.name))
      .map((mod) => mod.name)
    if (!unresolved.length) return
    unresolved.forEach((name) => identifiedLocalModNames.current.add(name))
    window.api.instance.identifyLocalMods(instance.id, unresolved)
      .then((identified) => {
        setLocalMods((current) => current.map((mod) => (
          identified[mod.name] ? { ...mod, ...identified[mod.name] } : mod
        )))
      })
      .catch(() => {})
  }, [detailTab, instance.id, localAdditions, modsLoaded])

  // Fetch mods when Mods tab is first opened
  useEffect(() => {
    if (detailTab !== 'mods' || modsLoaded || modsLoading || !hasModSource) return
    const loadRequest = setTimeout(() => {
      const modpackApi = (window.api as any).modpack
      if (!modpackApi) {
        setModsError('Restart the app to enable modpack features.')
        setModsLoaded(true)
        return
      }
      setModsLoading(true)
      setModsError(null)
      modpackApi
        .mods(instance.id)
        .then((data: PackMod[]) => {
          setMods(data)
          setModsLoaded(true)
        })
        .catch((e: unknown) => {
          setModsError(e instanceof Error ? e.message : 'Failed to load mods')
          setModsLoaded(true)
        })
        .finally(() => setModsLoading(false))
    }, 0)
    return () => clearTimeout(loadRequest)
  }, [detailTab, modsLoaded, modsLoading, instance.id, hasModSource])

  const play = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.launch.start(instance.id)
    } catch (e) {
      setError(ipcError(e))
    }
  }

  const switchVersion = async (versionId: string): Promise<void> => {
    setSwitching(versionId)
    try {
      await window.api.modpack.switchVersion(instance.id, versionId)
      await refreshInstances()
      setMods([])
      setModsLoaded(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Switch failed')
    } finally {
      setSwitching(null)
    }
  }

  const addMods = async (): Promise<void> => {
    setAddingMod(true)
    try {
      const paths = await (window.api as any).dialog?.pickModFiles?.() as string[] | undefined
      if (!paths?.length) return
      for (const p of paths) {
        await (window.api as any).instance?.addMod?.(instance.id, p)
      }
      const updated = await (window.api as any).instance?.listLocalMods?.(instance.id)
      if (updated) setLocalMods(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add mod')
    } finally {
      setAddingMod(false)
    }
  }

  const removeMod = async (fileName: string): Promise<void> => {
    try {
      await (window.api as any).instance?.removeMod?.(instance.id, fileName)
      setLocalMods((prev) => prev.filter((m) => m.name !== fileName))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove mod')
    }
  }

  const toggleLocalMod = async (mod: LocalMod): Promise<void> => {
    try {
      const updated = await window.api.instance.toggleLocalMod(instance.id, mod.name, !mod.enabled)
      setLocalMods((current) => current.map((item) => item.name === mod.name ? updated : item))
    } catch (e) {
      setError(ipcError(e))
    }
  }

  const searchMods = async (): Promise<void> => {
    setModSearching(true)
    try {
      setModResults(await window.api.customMods.search(instance.id, modQuery, modSource))
    } catch (e) {
      setError(ipcError(e))
    } finally {
      setModSearching(false)
    }
  }

  const installMod = async (projectId: string, source: 'modrinth' | 'curseforge'): Promise<void> => {
    setInstallingProject(projectId)
    try {
      const result = await window.api.customMods.install(instance.id, projectId, source)
      setManagedMods(result.installed)
      setModResults((current) => current.filter((item) => item.projectId !== projectId))
    } catch (e) {
      setError(ipcError(e))
    } finally {
      setInstallingProject(null)
    }
  }

  const toggleManaged = async (mod: LocalMod): Promise<void> => {
    if (!mod.projectId) return
    try {
      setManagedMods(await window.api.customMods.toggle(instance.id, mod.source ?? 'modrinth', mod.projectId, !mod.enabled))
    } catch (e) {
      setError(ipcError(e))
    }
  }

  const removeManaged = async (mod: LocalMod): Promise<void> => {
    if (!mod.projectId || !window.confirm(`Remove ${mod.displayName ?? mod.name}? Required libraries are kept in case another mod uses them.`)) return
    try {
      setManagedMods(await window.api.customMods.remove(instance.id, mod.source ?? 'modrinth', mod.projectId))
    } catch (e) {
      setError(ipcError(e))
    }
  }

  const updateCustomMods = async (): Promise<void> => {
    setUpdatingCustomMods(true)
    try {
      const result = await window.api.customMods.updateAll(instance.id)
      setManagedMods(result.installed)
    } catch (e) {
      setError(ipcError(e))
    } finally {
      setUpdatingCustomMods(false)
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div
        className="shrink-0 px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--border-soft)' }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 text-sm"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-3)'
              e.currentTarget.style.color = 'var(--text-bright)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-2)'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            title="Back to library"
          >
            ←
          </button>

          <div
            className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-2xl"
            style={{ background: 'var(--surface-2)' }}
          >
            {instance.iconUrl ? (
              <img src={instance.iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              '🧱'
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-base" style={{ color: 'var(--text-strong)' }}>
                {instance.name}
              </h2>
              {hasUpdate && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background: 'rgba(var(--warning-rgb),0.15)',
                    color: 'var(--warning)'
                  }}
                >
                  Update available
                </span>
              )}
              {instance.source && instance.source !== 'manual' && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={
                    instance.source === 'modrinth'
                      ? { background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)' }
                      : instance.source === 'ftb'
                      ? { background: 'rgba(239,68,68,0.12)', color: '#f87171' }
                      : instance.source === 'ftb-legacy'
                      ? { background: 'rgba(251,146,60,0.12)', color: '#fb923c' }
                      : instance.source === 'atlauncher'
                      ? { background: 'rgba(99,102,241,0.12)', color: '#818cf8' }
                      : instance.source === 'technic'
                      ? { background: 'rgba(220,38,38,0.12)', color: '#f87171' }
                      : { background: 'rgba(249,115,22,0.12)', color: '#fb923c' }
                  }
                >
                  {instance.source === 'modrinth' ? 'Modrinth' : instance.source === 'ftb' || instance.source === 'ftb-legacy' ? 'FTB' : instance.source === 'atlauncher' ? 'ATLauncher' : instance.source === 'technic' ? 'Technic' : 'CurseForge'}
                </span>
              )}
            </div>
            <div className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {instance.loader === 'vanilla' ? 'Vanilla' : instance.loader} · MC{' '}
              {instance.mcVersion}
            </div>
          </div>

          <button
            onClick={play}
            disabled={!signedIn || busy || running}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-black shrink-0 disabled:opacity-50"
            style={{
              background: 'var(--accent-strong)',
              boxShadow: '0 0 16px rgba(var(--accent-rgb),0.2)'
            }}
            title={signedIn ? '' : 'Sign in first'}
          >
            {running ? 'Running' : busy ? '…' : '▶ Play'}
          </button>
        </div>

        {/* Progress bar */}
        {progress && typeof progress.percent === 'number' && (
          <div className="mt-3">
            <div
              className="flex justify-between text-xs mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>{progressLabel(progress.state)}</span>
              <span>{progress.percent}%</span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'var(--surface-2)' }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${progress.percent}%`, background: 'var(--accent-strong)' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div
        className="shrink-0 flex gap-1 px-6 pt-3"
        style={{ borderBottom: '1px solid var(--border-soft)' }}
      >
        {/* Overview tab - only for modpack instances */}
        {hasModSource && (
          <button
            onClick={() => setDetailTab('overview')}
            className="relative px-4 py-2.5 text-sm font-medium transition-colors duration-150"
            style={{ color: detailTab === 'overview' ? 'var(--text-strong)' : 'var(--text-muted)' }}
          >
            {detailTab === 'overview' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)' }} />
            )}
            Overview
          </button>
        )}

        {/* Changelog tab - only for modpack instances */}
        {hasModSource && (
          <button
            onClick={() => setDetailTab('changelog')}
            className="relative px-4 py-2.5 text-sm font-medium transition-colors duration-150"
            style={{ color: detailTab === 'changelog' ? 'var(--text-strong)' : 'var(--text-muted)' }}
          >
            {detailTab === 'changelog' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)' }} />
            )}
            Changelog
          </button>
        )}

        {([...(instance.loader !== 'vanilla' ? ['mods'] as const : []), ...(hasModSource ? ['versions'] as const : [])]).map((t) => (
          <button
            key={t}
            onClick={() => setDetailTab(t)}
            className="relative px-4 py-2.5 text-sm font-medium transition-colors duration-150"
            style={{ color: detailTab === t ? 'var(--text-strong)' : 'var(--text-muted)' }}
          >
            {detailTab === t && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)' }}
              />
            )}
            {t === 'mods' ? 'Mods' : 'Versions'}
            {t === 'mods' && uniqueModCount > 0 && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)' }}>
                {uniqueModCount}
              </span>
            )}
            {t === 'versions' && !versionsLoading && versions.length > 0 && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(var(--overlay-rgb),0.06)', color: 'var(--text-muted)' }}>
                {versions.length}
              </span>
            )}
          </button>
        ))}
        {missingCurseForgeFiles.length > 0 && (
          <button
            onClick={() => setDetailTab('manual')}
            className="relative px-4 py-2.5 text-sm font-medium transition-colors duration-150"
            style={{ color: detailTab === 'manual' ? 'var(--text-strong)' : 'var(--text-muted)' }}
          >
            {detailTab === 'manual' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)' }} />
            )}
            Manual files
            <span
              className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{
                background: remainingManualFiles ? 'rgba(251,146,60,0.15)' : 'rgba(74,222,128,0.15)',
                color: remainingManualFiles ? '#fb923c' : '#4ade80'
              }}
            >
              {remainingManualFiles}
            </span>
          </button>
        )}
        <button
          onClick={() => setDetailTab('console')}
          className="relative px-4 py-2.5 text-sm font-medium transition-colors duration-150"
          style={{ color: detailTab === 'console' ? 'var(--text-strong)' : 'var(--text-muted)' }}
        >
          {detailTab === 'console' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
              style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)' }} />
          )}
          Console
          {logs.length > 0 && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: running ? 'rgba(var(--accent-rgb),0.15)' : 'rgba(var(--overlay-rgb),0.06)', color: running ? 'var(--accent)' : 'var(--text-muted)' }}>
              {logs.length}
            </span>
          )}
          {running && logs.length === 0 && (
            <span className="ml-1.5 w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: 'var(--accent)', boxShadow: '0 0 4px var(--accent)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          )}
        </button>

        {/* Settings tab - always visible */}
        <button
          onClick={() => setDetailTab('settings')}
          className="relative px-4 py-2.5 text-sm font-medium transition-colors duration-150 ml-auto"
          style={{ color: detailTab === 'settings' ? 'var(--text-strong)' : 'var(--text-muted)' }}
        >
          {detailTab === 'settings' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
              style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)' }} />
          )}
          Settings
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {detailTab === 'settings' ? (
          <InstanceSettingsTab
            instance={instance}
            onUpdated={refreshInstances}
          />
        ) : detailTab === 'changelog' ? (
          <ChangelogTabContent
            changelogs={changelogs}
            loading={changelogLoading}
            error={changelogError}
            currentVersionId={instance.packVersionId}
          />
        ) : detailTab === 'overview' ? (
          <OverviewTabContent
            instance={instance}
            overview={overview}
            loading={overviewLoading}
            error={overviewError}
          />
        ) : detailTab === 'console' ? (
          <ConsoleTabContent logs={logs} running={running ?? false} />
        ) : detailTab === 'manual' ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-bright)' }}>
                Manual CurseForge files
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Download each restricted file from CurseForge, then import its JAR here. Completed files stay checked for this instance.
              </p>
            </div>
            {remainingManualFiles === 0 && (
              <div className="rounded-xl px-4 py-3 text-xs font-semibold" style={{ background: 'rgba(74,222,128,0.09)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.24)' }}>
                ✓ All manual files have been imported.
              </div>
            )}
            <MissingCurseForgeChecklist
              instanceId={instance.id}
              files={missingCurseForgeFiles}
              onFilesChanged={setMissingCurseForgeFiles}
            />
          </div>
        ) : detailTab === 'mods' ? (
          <div className="space-y-5">
            {/* Mods tab toolbar */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                {hasModSource ? 'Pack mods and additions' : 'Custom modpack builder'}
              </span>
              <div className="flex gap-2">
                {managedAdditions.length > 0 && <button onClick={updateCustomMods} disabled={updatingCustomMods || running} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}>{updatingCustomMods ? 'Updating…' : 'Update all'}</button>}
                <button onClick={addMods} disabled={addingMod || running} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50" style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 1v10M1 6h10"/></svg>
                  {addingMod ? 'Adding…' : 'Add local JAR'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
              <div className="flex gap-1 mb-3">
                {(['modrinth', 'curseforge'] as const).map((source) => <button
                  key={source}
                  onClick={() => { setModSource(source); setModResults([]) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={modSource === source
                    ? { background: source === 'modrinth' ? 'rgba(29,209,161,0.16)' : 'rgba(249,115,22,0.16)', color: source === 'modrinth' ? '#1dd1a1' : '#fb923c', border: `1px solid ${source === 'modrinth' ? 'rgba(29,209,161,0.3)' : 'rgba(249,115,22,0.3)'}` }
                    : { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}
                >{source === 'modrinth' ? 'Modrinth' : 'CurseForge'}</button>)}
              </div>
              <div className="flex gap-2">
                <input
                  value={modQuery}
                  onChange={(e) => setModQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void searchMods() }}
                  placeholder={`Search ${modSource === 'modrinth' ? 'Modrinth' : 'CurseForge'} ${instance.loader} mods for Minecraft ${instance.mcVersion}`}
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-bright)' }}
                />
                <button onClick={searchMods} disabled={modSearching || running} className="px-4 py-2 rounded-xl text-sm font-semibold text-black disabled:opacity-50" style={{ background: 'var(--accent-strong)' }}>{modSearching ? 'Searching…' : `Search ${modSource === 'modrinth' ? 'Modrinth' : 'CurseForge'}`}</button>
              </div>
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-faint)' }}>Results are filtered to this Minecraft version and loader. Required dependencies are installed automatically.</p>
            </div>

            {modResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {modResults.map((result) => {
                  const installed = managedMods.some((mod) => (mod.source ?? 'modrinth') === result.source && mod.projectId === result.projectId)
                    || mods.some((mod) => mod.source === result.source && mod.projectId === result.projectId)
                  return <div key={result.projectId} className="flex gap-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>{result.iconUrl ? <img src={result.iconUrl} alt="" className="w-full h-full object-cover" /> : '🔧'}</div>
                    <div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate" style={{ color: 'var(--text-bright)' }}>{result.title}</div><div className="text-[11px] line-clamp-2" style={{ color: 'var(--text-muted)' }}>{result.description}</div></div>
                    <button onClick={() => void installMod(result.projectId, result.source)} disabled={installed || installingProject !== null || running} className="self-center px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: installed ? 'var(--surface-2)' : 'var(--accent-strong)', color: installed ? 'var(--text-muted)' : '#000' }}>{installed ? 'Installed' : installingProject === result.projectId ? 'Installing…' : 'Install'}</button>
                  </div>
                })}
              </div>
            )}

            {managedAdditions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Managed mods ({managedAdditions.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {managedAdditions.map((mod) => <div key={mod.projectId} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', opacity: mod.enabled ? 1 : 0.6 }}>
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>{mod.iconUrl ? <img src={mod.iconUrl} alt="" className="w-full h-full object-cover" /> : '🔧'}</div>
                    <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate" style={{ color: 'var(--text-bright)' }}>{mod.displayName ?? mod.name.replace(/\.jar(?:\.disabled)?$/i, '')}</div><div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{fmtBytes(mod.size)} · {mod.enabled ? 'Enabled' : 'Disabled'} · {(mod.source ?? 'modrinth') === 'modrinth' ? 'Modrinth' : 'CurseForge'}</div></div>
                    <button onClick={() => void toggleManaged(mod)} disabled={running} className="text-[11px] px-2 py-1 rounded-lg disabled:opacity-50" style={{ color: 'var(--accent)' }}>{mod.enabled ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => void removeManaged(mod)} disabled={running} className="text-sm disabled:opacity-50" style={{ color: 'var(--danger-soft)' }} title="Remove mod">×</button>
                  </div>)}
                </div>
              </div>
            )}

            {/* Update banner (if update available) */}
            {hasUpdate && latestVersion && (
              <div
                className="flex items-center justify-between gap-4 p-4 rounded-xl"
                style={{ background: 'rgba(var(--warning-rgb),0.08)', border: '1px solid rgba(var(--warning-rgb),0.25)' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--warning)' }}>Pack update available</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {latestVersion.name || latestVersion.versionNumber} is ready to install
                  </p>
                </div>
                <button
                  onClick={() => { setDetailTab('versions'); switchVersion(latestVersion.id) }}
                  disabled={!!switching}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-black shrink-0 disabled:opacity-50"
                  style={{ background: 'var(--warning)' }}
                >
                  {switching ? 'Updating…' : 'Update now'}
                </button>
              </div>
            )}

            {/* Pack mods list */}
            {hasModSource ? (
              <ModsTabContent mods={mods} loading={modsLoading} loaded={modsLoaded} error={modsError} />
            ) : managedAdditions.length === 0 && localAdditions.length === 0 && modResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: 'var(--text-dim)' }}>
                <div className="text-4xl mb-4">🔧</div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Start building your modpack</p>
                <p className="text-xs mt-1">Search Modrinth above or add a local JAR.</p>
              </div>
            ) : null}

            {/* Local / manually added mods */}
            {localAdditions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                  Local mods ({localAdditions.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {localAdditions.map((mod) => (
                    <div
                      key={mod.name}
                      className="flex items-center gap-3 p-3 rounded-xl group"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
                      role={mod.externalUrl ? 'link' : undefined}
                      tabIndex={mod.externalUrl ? 0 : undefined}
                      onClick={() => mod.externalUrl && window.api.shell.openExternal(mod.externalUrl)}
                      onKeyDown={(event) => {
                        if (mod.externalUrl && (event.key === 'Enter' || event.key === ' ')) {
                          window.api.shell.openExternal(mod.externalUrl)
                        }
                      }}
                      title={mod.externalUrl ? `Open ${mod.displayName ?? mod.name} on Modrinth` : undefined}
                    >
                      <div
                        className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-lg"
                        style={{ background: 'var(--surface-2)' }}
                      >
                        {mod.iconUrl ? <img src={mod.iconUrl} alt="" className="w-full h-full rounded-lg object-cover" /> : '🔧'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-bright)' }}>
                          {mod.displayName ?? mod.name.replace(/\.jar$/i, '')}
                        </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                          {fmtBytes(mod.size)} · {mod.enabled ? 'Enabled' : 'Disabled'}{mod.source === 'modrinth' ? ' · Modrinth' : ''}
                      </div>
                      </div>
                      {mod.externalUrl && <span className="text-xs" style={{ color: 'var(--text-faint)' }}>↗</span>}
                      <button onClick={(event) => { event.stopPropagation(); void toggleLocalMod(mod) }} disabled={running} className="text-[11px] px-2 py-1 rounded-lg disabled:opacity-50" style={{ color: 'var(--accent)' }}>{mod.enabled ? 'Disable' : 'Enable'}</button>
                      <button
                        onClick={(event) => { event.stopPropagation(); removeMod(mod.name) }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg"
                        style={{ color: 'var(--danger-soft)' }}
                        title="Remove mod"
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(var(--danger-rgb),0.12)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <VersionsTabContent
            instance={instance}
            versions={versions}
            loading={versionsLoading}
            error={versionsError}
            switching={switching}
            onSwitch={switchVersion}
            hasUpdate={hasUpdate}
            latestVersion={latestVersion}
          />
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════
   Combined Library page with tabs
════════════════════════════════════════════════ */

type Tab = 'instances' | 'browse'

const TABS: { id: Tab; label: string }[] = [
  { id: 'instances', label: 'My Instances' },
  { id: 'browse',    label: 'Browse Modpacks' }
]

interface MissingImportReport {
  instanceId: string
  instanceName: string
  files: MissingCurseForgeFile[]
}

export default function Library(): JSX.Element {
  const [tab, setTab] = useState<Tab>('instances')
  const instances = useApp((s) => s.instances)
  const [showNew, setShowNew] = useState(false)
  const [importing, setImporting] = useState(false)
  const [missingImport, setMissingImport] = useState<MissingImportReport | null>(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const pendingLibraryInstanceId = useApp((s) => s.pendingLibraryInstanceId)
  const setPendingLibraryInstanceId = useApp((s) => s.setPendingLibraryInstanceId)
  const refreshInstances = useApp((s) => s.refreshInstances)
  const setError = useApp((s) => s.setError)
  const setImportProgress = useApp((s) => s.setImportProgress)

  const importPack = useCallback(async (): Promise<void> => {
    const filePath = await window.api.dialog.pickFile([{ name: 'Modpack', extensions: ['mrpack', 'zip'] }])
    if (!filePath) return
    setImporting(true)
    setImportProgress({ status: 'active', message: 'Starting modpack import…', percent: 0 })
    try {
      const result = await window.api.modpack.importFile(filePath)
      await refreshInstances()
      if (result.missingFiles.length) {
        setImportProgress({
          status: 'partial',
          message: `Import complete · ${result.missingFiles.length} manual file${result.missingFiles.length === 1 ? '' : 's'} needed`,
          percent: 100
        })
        setMissingImport({
          instanceId: result.instance.id,
          instanceName: result.instance.name,
          files: result.missingFiles
        })
      } else {
        setImportProgress({ status: 'complete', message: 'Modpack import complete', percent: 100 })
      }
    } catch (e) {
      const message = ipcError(e)
      setImportProgress({ status: 'error', message: 'Import failed', percent: undefined })
      setError(message)
    } finally {
      setImporting(false)
    }
  }, [refreshInstances, setError, setImportProgress])

  const importBackup = useCallback(async (): Promise<void> => {
    const filePath = await window.api.dialog.pickFile([{ name: 'Thendrask backup', extensions: ['zip'] }])
    if (!filePath) return
    setImporting(true)
    try {
      await window.api.instance.importBackup(filePath)
      await refreshInstances()
    } catch (e) {
      setError(ipcError(e))
    } finally {
      setImporting(false)
    }
  }, [refreshInstances, setError])

  // Consume the pending instance ID set by Home page navigation
  useEffect(() => {
    if (!pendingLibraryInstanceId) return
    const pendingId = pendingLibraryInstanceId
    const consumePending = setTimeout(() => {
      setTab('instances')
      setSelectedInstanceId(pendingId)
      setPendingLibraryInstanceId(null)
    }, 0)
    return () => clearTimeout(consumePending)
  }, [pendingLibraryInstanceId, setPendingLibraryInstanceId])

  // Auto-updates when switchVersion runs refreshInstances
  const selectedInstance = selectedInstanceId
    ? (instances.find((i) => i.id === selectedInstanceId) ?? null)
    : null

  const isInDetail = tab === 'instances' && !!selectedInstance

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tab bar + action button - hidden while viewing instance detail */}
      {!isInDetail && (
        <div
          className="shrink-0 flex items-center justify-between px-6 pt-4"
          style={{ borderBottom: '1px solid var(--border-soft)' }}
        >
          <div className="flex gap-1">
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
                    style={{
                      background: 'var(--accent-strong)',
                      boxShadow: '0 0 8px rgba(var(--accent-rgb),0.5)'
                    }}
                  />
                )}
                {t.label}
                {t.id === 'instances' && instances.length > 0 && (
                  <span
                    className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={
                      tab === 'instances'
                        ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }
                        : {
                            background: 'rgba(var(--overlay-rgb),0.06)',
                            color: 'var(--text-muted)'
                          }
                    }
                  >
                    {instances.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'instances' && (
            <div className="mb-1 flex gap-2">
              <button
                onClick={importPack}
                disabled={importing}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}
                onMouseEnter={(e) => { if (!importing) { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-bright)' } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-soft)' }}
                title="Import a .mrpack or CurseForge zip"
              >
                {importing ? 'Importing…' : '↑ Import'}
              </button>
              <button
                onClick={importBackup}
                disabled={importing}
                className="px-3 py-1.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}
                title="Restore a portable Thendrask backup"
              >
                Restore backup
              </button>
              <button
                onClick={() => setShowNew(true)}
                className="px-4 py-1.5 rounded-xl text-sm font-semibold text-black transition-all"
                style={{ background: 'var(--accent-strong)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-strong)')}
              >
                + New instance
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab content - relative+overflow-hidden when detail is open so the panel can use absolute inset-0 */}
      <div
        className="flex-1 min-h-0"
        style={isInDetail ? { position: 'relative', overflow: 'hidden' } : { overflowY: 'auto' }}
      >
        {isInDetail ? (
          <PanelErrorBoundary>
            <InstanceDetailPanel
              key={selectedInstance!.id}
              instance={selectedInstance!}
              onBack={() => setSelectedInstanceId(null)}
            />
          </PanelErrorBoundary>
        ) : tab === 'instances' ? (
          <MyInstancesContent
            showNew={showNew}
            setShowNew={setShowNew}
            onManage={(id) => setSelectedInstanceId(id)}
          />
        ) : (
          <BrowseModpacks />
        )}
      </div>

      {missingImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.82)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="missing-mods-title"
        >
          <div
            className="w-full max-w-2xl max-h-[calc(100vh-48px)] rounded-2xl overflow-hidden flex flex-col"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.55)'
            }}
          >
            <div className="p-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--border-soft)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: '#fb923c' }}>
                    Partial CurseForge import
                  </div>
                  <h2 id="missing-mods-title" className="text-lg font-black" style={{ color: 'var(--text-bright)' }}>
                    {missingImport.files.filter((file) => !file.importedFileName).length === 0
                      ? 'All manual mods have been imported'
                      : `${missingImport.files.filter((file) => !file.importedFileName).length} of ${missingImport.files.length} blocked mods still need attention`}
                  </h2>
                  <p className="text-xs mt-1.5 leading-5 max-w-xl" style={{ color: 'var(--text-muted)' }}>
                    {missingImport.instanceName} was created with everything CurseForge allowed Thendrask to download.
                    Use Download to open the official file page, then Import JAR after you save it.
                  </p>
                </div>
                <button
                  onClick={() => setMissingImport(null)}
                  className="shrink-0 w-9 h-9 rounded-lg text-lg"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                  aria-label="Close missing mods report"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
              <MissingCurseForgeChecklist
                instanceId={missingImport.instanceId}
                files={missingImport.files}
                onFilesChanged={(files) => setMissingImport((current) =>
                  current ? { ...current, files } : current
                )}
              />
            </div>

            <div
              className="px-5 py-4 flex justify-end gap-3 shrink-0"
              style={{ background: 'var(--bg-inset)', borderTop: '1px solid var(--border-soft)' }}
            >
              <button
                onClick={() => setMissingImport(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedInstanceId(missingImport.instanceId)
                  setTab('instances')
                  setMissingImport(null)
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-black"
                style={{ background: 'var(--accent-strong)' }}
              >
                Open imported instance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
