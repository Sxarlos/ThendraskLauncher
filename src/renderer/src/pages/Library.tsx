import { Component, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ErrorInfo, ReactNode } from 'react'
import type { BrowseParams, Instance, ModpackResult, PackMod, PackOverview, PackVersion, VersionChangelog } from '@shared/types'
import { activeAccount, useApp } from '../store'
import NewInstanceModal from '../components/NewInstanceModal'
import { ipcError } from '../lib/ipcError'
import { formatPlayTime } from '../lib/formatPlayTime'

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
   MY INSTANCES tab
════════════════════════════════════════════════ */

function progressLabel(state?: string): string {
  switch (state) {
    case 'preparing':  return 'Preparing…'
    case 'downloading': return 'Downloading…'
    case 'launching':  return 'Launching…'
    case 'running':    return 'Running'
    case 'error':      return 'Error'
    default:           return ''
  }
}

function InstanceCard({
  instance,
  onManage
}: {
  instance: Instance
  onManage: (i: Instance) => void
}): JSX.Element {
  const accounts = useApp((s) => s.accounts)
  const progress = useApp((s) => s.progress[instance.id])
  const setError = useApp((s) => s.setError)
  const refreshInstances = useApp((s) => s.refreshInstances)

  const signedIn = !!activeAccount(accounts)
  const busy = progress && ['preparing', 'downloading', 'launching'].includes(progress.state)
  const running = progress?.state === 'running'

  const play = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.launch.start(instance.id)
    } catch (e) {
      setError(ipcError(e))
    }
  }

  const remove = async (): Promise<void> => {
    await window.api.instances.remove(instance.id)
    await refreshInstances()
  }

  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200 cursor-pointer"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hovered ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border-soft)'}`,
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.2)',
      }}
      onClick={() => onManage(instance)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Subtle icon atmosphere */}
      {instance.iconUrl && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            backgroundImage: `url(${instance.iconUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(48px)',
            transform: 'scale(2)',
            opacity: hovered ? 0.12 : 0.06,
          }}
        />
      )}
      <div className="relative z-10 flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-2xl"
          style={{ background: 'var(--surface-2)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
        >
          {instance.iconUrl ? (
            <img src={instance.iconUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            '🧱'
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px] leading-snug text-white truncate">{instance.name}</div>
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
            {instance.loader === 'vanilla' ? 'Vanilla' : instance.loader} · MC {instance.mcVersion}
            {instance.timePlayed ? (
              <span style={{ color: 'var(--text-dim)' }}> · {formatPlayTime(instance.timePlayed)} played</span>
            ) : null}
          </div>
        </div>
        {running && (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.8)' }}
          />
        )}
      </div>

      {progress && progress.state !== 'closed' && (
        <div
          className="relative z-10 text-xs"
          style={{ color: progress.state === 'error' ? '#f87171' : 'var(--text-muted)' }}
        >
          <div className="flex justify-between mb-1">
            <span>{progressLabel(progress.state)}{progress.message ? ` - ${progress.message}` : ''}</span>
            {typeof progress.percent === 'number' && <span>{progress.percent}%</span>}
          </div>
          {typeof progress.percent === 'number' && (
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full" style={{ width: `${progress.percent}%`, background: 'var(--accent-strong)' }} />
            </div>
          )}
        </div>
      )}

      <div className="relative z-10 flex gap-2 mt-auto">
        <button
          onClick={(e) => { e.stopPropagation(); void play() }}
          disabled={!signedIn || busy || running}
          className="flex-1 py-2 rounded-xl text-sm font-semibold text-black transition-all disabled:opacity-50"
          style={{ background: 'var(--accent-strong)', boxShadow: hovered ? '0 0 16px rgba(var(--accent-rgb),0.3)' : 'none' }}
          title={signedIn ? '' : 'Sign in with a Microsoft account first'}
          onMouseEnter={(e) => { if (!busy && !running) e.currentTarget.style.background = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
        >
          {running ? '● Running' : busy ? progressLabel(progress?.state) : '▶ Play'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onManage(instance) }}
          className="px-3 py-2 rounded-xl text-sm transition-colors"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-soft)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          title="Manage instance"
        >
          ⚙
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); void remove() }}
          className="px-3 py-2 rounded-xl text-sm transition-colors"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--danger-rgb),0.12)'; e.currentTarget.style.color = 'var(--danger-soft)'; e.currentTarget.style.borderColor = 'rgba(var(--danger-rgb),0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-soft)' }}
          title="Delete instance"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════
   BROWSE tab
════════════════════════════════════════════════ */

type Source = 'modrinth' | 'curseforge' | 'ftb' | 'ftb-legacy' | 'atlauncher' | 'technic'
type FtbLegacyCat = 'public' | '3rdparty' | 'private'
type AtlCat = 'public' | 'private'
type LoaderFilter = 'all' | 'fabric' | 'forge' | 'quilt' | 'neoforge'
type SortOption = 'popular' | 'updated' | 'newest'

const MR_CATEGORIES: { id: string; label: string }[] = [
  { id: 'technology',   label: 'Tech'        },
  { id: 'adventure',    label: 'Adventure'   },
  { id: 'magic',        label: 'Magic'       },
  { id: 'optimization', label: 'Optimization'},
  { id: 'quests',       label: 'Quests'      },
  { id: 'exploration',  label: 'Exploration' },
]

const LOADERS: { value: LoaderFilter; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'fabric',   label: 'Fabric' },
  { value: 'forge',    label: 'Forge' },
  { value: 'quilt',    label: 'Quilt' },
  { value: 'neoforge', label: 'NeoForge' },
]

const COMMON_VERSIONS = [
  '1.21.4', '1.21.1', '1.21', '1.20.4', '1.20.1', '1.20',
  '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.12.2', '1.7.10',
]

const PAGE_SIZE = 20

function fmtDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function loaderColor(l: string): { bg: string; text: string } {
  switch (l) {
    case 'fabric':   return { bg: 'rgba(var(--warning-rgb),0.15)',  text: 'var(--warning)' }
    case 'forge':    return { bg: 'rgba(249,115,22,0.15)',  text: '#f97316' }
    case 'quilt':    return { bg: 'rgba(168,85,247,0.15)',  text: '#a855f7' }
    case 'neoforge': return { bg: 'rgba(var(--danger-rgb),0.15)',   text: 'var(--danger)' }
    default:         return { bg: 'rgba(107,114,128,0.15)', text: 'var(--text-soft)' }
  }
}

function SkeletonCard(): JSX.Element {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-xl shrink-0 skeleton" />
        <div className="flex-1 pt-1 space-y-2">
          <div className="h-3.5 rounded-lg skeleton w-3/4" />
          <div className="h-3 rounded-lg skeleton w-1/2" />
          <div className="h-3 rounded-lg skeleton w-1/3" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 rounded-lg skeleton" />
        <div className="h-3 rounded-lg skeleton w-4/5" />
      </div>
      <div className="flex gap-1.5">
        <div className="h-5 w-14 rounded-full skeleton" />
        <div className="h-5 w-20 rounded-full skeleton" />
      </div>
      <div className="h-9 rounded-xl skeleton mt-auto" />
    </div>
  )
}

function InstallModal({ pack, onClose }: { pack: ModpackResult; onClose: () => void }): JSX.Element {
  const refreshInstances = useApp((s) => s.refreshInstances)
  const setInstalling = useApp((s) => s.setInstalling)
  const setError = useApp((s) => s.setError)
  const [name, setName] = useState(pack.name)
  const [busy, setBusy] = useState(false)

  const latestMc = pack.mcVersions[0] ?? ''
  const loader = (pack.loaders[0] ?? 'fabric') as any

  const install = async (): Promise<void> => {
    setBusy(true)
    setInstalling(1)
    try {
      await window.api.instances.create({
        name: name.trim() || pack.name,
        mcVersion: latestMc,
        loader,
        source: pack.source,
        externalId: pack.id,
        iconUrl: pack.iconUrl,
      })
      await refreshInstances()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed.')
      setBusy(false)
    } finally {
      setInstalling(-1)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-[420px] rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
        <div className="flex items-center gap-4 mb-5">
          {pack.iconUrl ? (
            <img src={pack.iconUrl} alt="" className="w-14 h-14 rounded-xl object-cover shadow-lg shrink-0" style={{ boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} />
          ) : (
            <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center text-2xl" style={{ background: 'var(--surface-2)' }}>📦</div>
          )}
          <div className="min-w-0">
            <h2 className="font-bold text-base text-white truncate">{pack.name}</h2>
            {pack.author && <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>by {pack.author}</p>}
            <div className="flex gap-2 mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
              <span className="capitalize">{loader}</span>
              <span>·</span>
              <span>MC {latestMc || 'unknown'}</span>
            </div>
          </div>
        </div>

        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Instance name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-5 px-3 py-2.5 rounded-xl text-sm text-white outline-none transition-colors"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-strong)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-soft)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
          >
            Cancel
          </button>
          <button
            onClick={install}
            disabled={busy}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-black transition-all disabled:opacity-60"
            style={{ background: 'var(--accent-strong)', boxShadow: '0 0 16px rgba(var(--accent-rgb),0.25)' }}
            onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent)' }}
            onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent-strong)' }}
          >
            {busy ? 'Installing…' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PackCard({ pack, onInstall }: { pack: ModpackResult; onInstall: (p: ModpackResult) => void }): JSX.Element {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="relative overflow-hidden rounded-2xl flex flex-col transition-all duration-300 cursor-default"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hovered ? 'rgba(var(--accent-rgb),0.25)' : 'var(--border-soft)'}`,
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--accent-rgb),0.1)' : '0 4px 12px rgba(0,0,0,0.3)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {pack.iconUrl && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-500"
          style={{
            backgroundImage: `url(${pack.iconUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(48px)',
            transform: 'scale(2)',
            opacity: hovered ? 0.18 : 0.1,
          }}
        />
      )}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(160deg, rgba(10,12,16,0.4) 0%, rgba(10,12,16,0.85) 100%)' }} />

      <div className="relative z-10 p-4 flex flex-col gap-3 h-full">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--overlay-rgb),0.06)' }}>
            {pack.iconUrl ? (
              <img src={pack.iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: 'var(--surface-2)' }}>📦</div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="font-semibold text-[14px] leading-snug text-white truncate">{pack.name}</div>
            {pack.author && (
              <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>by {pack.author}</div>
            )}
            <div className="text-xs mt-1 font-semibold" style={{ color: 'var(--accent-strong)' }}>
              ↓ {fmtDownloads(pack.downloads)}
            </div>
          </div>

          <span
            className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide"
            style={
              pack.source === 'modrinth'
                ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }
                : pack.source === 'ftb'
                ? { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
                : pack.source === 'ftb-legacy'
                ? { background: 'rgba(251,146,60,0.15)', color: '#fb923c' }
                : pack.source === 'atlauncher'
                ? { background: 'rgba(99,102,241,0.15)', color: '#818cf8' }
                : pack.source === 'technic'
                ? { background: 'rgba(220,38,38,0.15)', color: '#f87171' }
                : { background: 'rgba(249,115,22,0.15)', color: '#fb923c' }
            }
          >
            {pack.source === 'modrinth' ? 'MR' : pack.source === 'ftb' || pack.source === 'ftb-legacy' ? 'FTB' : pack.source === 'atlauncher' ? 'ATL' : pack.source === 'technic' ? 'TCH' : 'CF'}
          </span>
        </div>

        <p className="text-[13px] leading-relaxed line-clamp-2 flex-1" style={{ color: 'var(--text-soft)' }}>
          {pack.description}
        </p>

        {(pack.loaders.length > 0 || pack.categories.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {pack.loaders.map((l) => {
              const c = loaderColor(l)
              return (
                <span key={l} className="text-[11px] px-2 py-0.5 rounded-full font-medium capitalize" style={{ background: c.bg, color: c.text }}>
                  {l}
                </span>
              )
            })}
            {pack.categories.slice(0, 2).map((c) => (
              <span key={c} className="text-[11px] px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(var(--overlay-rgb),0.05)', color: 'var(--text-muted)' }}>
                {c}
              </span>
            ))}
          </div>
        )}

        {pack.mcVersions.length > 0 && (
          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            MC {pack.mcVersions[0]}
            {pack.mcVersions.length > 1 && ` – ${pack.mcVersions[pack.mcVersions.length - 1]}`}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onInstall(pack)}
            className="flex-1 py-2 rounded-xl text-sm font-semibold text-black transition-all"
            style={{
              background: hovered ? 'var(--accent)' : 'var(--accent-strong)',
              boxShadow: hovered ? '0 0 16px rgba(var(--accent-rgb),0.35)' : 'none',
            }}
          >
            Install
          </button>
          {pack.externalUrl && (
            <a
              href={pack.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-xl text-sm transition-colors flex items-center justify-center"
              style={{ background: 'rgba(var(--overlay-rgb),0.05)', color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--overlay-rgb),0.1)'; e.currentTarget.style.color = 'var(--text-bright)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--overlay-rgb),0.05)'; e.currentTarget.style.color = 'var(--text-muted)' }}
              title="View on website"
            >
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function BrowseModpacks(): JSX.Element {
  const [source, setSource] = useState<Source>('modrinth')
  const [ftbLegacyCat, setFtbLegacyCat] = useState<FtbLegacyCat>('public')
  const [atlCat, setAtlCat] = useState<AtlCat>('public')
  const [privateCode, setPrivateCode] = useState('')
  const [privatePackId, setPrivatePackId] = useState('')
  const [query, setQuery] = useState('')
  const [loader, setLoader] = useState<LoaderFilter>('all')
  const [mcVersion, setMcVersion] = useState('')
  const [sort, setSort] = useState<SortOption>('popular')
  const [category, setCategory] = useState<string>('')
  const [results, setResults] = useState<ModpackResult[]>([])
  const [loading, setLoading] = useState(false)
  const [browseError, setBrowseError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [installing, setInstalling] = useState<ModpackResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (
    q: string, src: Source, ldr: LoaderFilter, ver: string, off: number, append: boolean,
    ftbCat: FtbLegacyCat, atl: AtlCat, privCode: string, privId: string,
    srt: SortOption, cat: string
  ): Promise<void> => {
    setLoading(true)
    setBrowseError(null)
    try {
      const sortParam = srt === 'updated' ? 'updated' : srt === 'newest' ? 'newest' : 'downloads'
      const params: BrowseParams = {
        query: q,
        loader: ldr === 'all' ? undefined : ldr,
        mcVersion: ver || undefined,
        limit: PAGE_SIZE,
        offset: off,
        sort: sortParam,
        category: cat || undefined,
      }
      let data: ModpackResult[]
      if (src === 'modrinth') {
        data = await window.api.browse.modrinth(params)
      } else if (src === 'curseforge') {
        data = await window.api.browse.curseforge(params)
      } else if (src === 'ftb') {
        data = await (window.api.browse as any).ftb(params)
      } else if (src === 'ftb-legacy') {
        if (ftbCat === 'private') {
          if (!privCode || !privId) { setLoading(false); setResults([]); return }
          data = await (window.api.browse as any).ftbLegacy(
            { ...params, query: privId, privateCode: privCode }, 'private'
          )
        } else {
          data = await (window.api.browse as any).ftbLegacy(params, ftbCat)
        }
      } else if (src === 'technic') {
        data = await (window.api.browse as any).technic(params)
      } else {
        data = await (window.api.browse as any).atlauncher(params, atl)
      }
      setResults((prev) => append ? [...prev, ...data] : data)
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setOffset(0)
    setResults([])
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(query, source, loader, mcVersion, 0, false, ftbLegacyCat, atlCat, privateCode, privatePackId, sort, category)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, source, loader, mcVersion, doSearch, ftbLegacyCat, atlCat, privateCode, privatePackId, sort, category])

  const loadMore = (): void => {
    const next = offset + PAGE_SIZE
    setOffset(next)
    doSearch(query, source, loader, mcVersion, next, true, ftbLegacyCat, atlCat, privateCode, privatePackId, sort, category)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 px-6 pt-4 pb-4 space-y-3" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source pills */}
          <div className="flex gap-1 p-1 rounded-xl shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
            {([
              { id: 'modrinth',    label: 'Modrinth',    activeStyle: { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', boxShadow: 'inset 0 1px 0 rgba(var(--accent-rgb),0.1)' } },
              { id: 'curseforge',  label: 'CurseForge',  activeStyle: { background: 'rgba(249,115,22,0.15)', color: '#fb923c', boxShadow: 'inset 0 1px 0 rgba(249,115,22,0.1)' } },
              { id: 'ftb',         label: 'FTB',          activeStyle: { background: 'rgba(239,68,68,0.15)', color: '#f87171', boxShadow: 'inset 0 1px 0 rgba(239,68,68,0.1)' } },
              { id: 'ftb-legacy',  label: 'FTB Legacy',   activeStyle: { background: 'rgba(251,146,60,0.15)', color: '#fb923c', boxShadow: 'inset 0 1px 0 rgba(251,146,60,0.1)' } },
              { id: 'atlauncher',  label: 'ATLauncher',   activeStyle: { background: 'rgba(99,102,241,0.15)', color: '#818cf8', boxShadow: 'inset 0 1px 0 rgba(99,102,241,0.1)' } },
              { id: 'technic',     label: 'Technic',       activeStyle: { background: 'rgba(220,38,38,0.15)', color: '#f87171', boxShadow: 'inset 0 1px 0 rgba(220,38,38,0.1)' } },
            ] as { id: Source; label: string; activeStyle: CSSProperties }[]).map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200"
                style={source === s.id ? s.activeStyle : { background: 'transparent', color: 'var(--text-muted)' }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* FTB Legacy sub-category tabs */}
        {source === 'ftb-legacy' && (
          <div className="flex gap-1">
            {([
              { id: 'public',   label: 'Public' },
              { id: '3rdparty', label: '3rd Party' },
              { id: 'private',  label: 'Private' },
            ] as { id: FtbLegacyCat; label: string }[]).map((c) => (
              <button
                key={c.id}
                onClick={() => setFtbLegacyCat(c.id)}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                style={
                  ftbLegacyCat === c.id
                    ? { background: 'rgba(251,146,60,0.2)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }
                    : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* ATLauncher sub-category tabs */}
        {source === 'atlauncher' && (
          <div className="flex gap-1">
            {([
              { id: 'public',  label: 'Public' },
              { id: 'private', label: 'Private' },
            ] as { id: AtlCat; label: string }[]).map((c) => (
              <button
                key={c.id}
                onClick={() => setAtlCat(c.id)}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                style={
                  atlCat === c.id
                    ? { background: 'rgba(99,102,241,0.2)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }
                    : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* FTB Legacy Private: code + pack ID inputs */}
        {source === 'ftb-legacy' && ftbLegacyCat === 'private' ? (
          <div className="flex items-center gap-2">
            <input
              value={privateCode}
              onChange={(e) => setPrivateCode(e.target.value)}
              placeholder="Private code…"
              className="flex-1 px-3 py-2 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(251,146,60,0.5)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-soft)')}
            />
            <input
              value={privatePackId}
              onChange={(e) => setPrivatePackId(e.target.value)}
              placeholder="Pack ID…"
              className="w-28 px-3 py-2 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(251,146,60,0.5)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-soft)')}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: 'var(--text-faint)' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search modpacks…"
                className="w-full pl-9 pr-4 py-2 rounded-xl text-sm text-white placeholder:text-gray-600 outline-none transition-all"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.4)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-soft)')}
              />
            </div>

            {/* Version dropdown */}
            <select
              value={mcVersion}
              onChange={(e) => setMcVersion(e.target.value)}
              className="py-2 pl-3 pr-8 rounded-xl text-sm outline-none shrink-0 transition-all cursor-pointer appearance-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', color: mcVersion ? 'var(--text-bright)' : 'var(--text-muted)' }}
            >
              <option value="">All versions</option>
              {COMMON_VERSIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}

        {/* Sort + category filters - shown for Modrinth and CurseForge */}
        {(source === 'modrinth' || source === 'curseforge') && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {([
                { id: 'popular', label: 'Popular' },
                { id: 'updated', label: 'Updated' },
                { id: 'newest',  label: 'Newest'  },
              ] as { id: SortOption; label: string }[]).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={
                    sort === s.id
                      ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }
                      : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>

            {source === 'modrinth' && (
              <div className="flex gap-1 flex-wrap">
                {MR_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(category === c.id ? '' : c.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={
                      category === c.id
                        ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }
                        : { background: 'transparent', color: 'var(--text-faint)', border: '1px solid var(--border-soft)' }
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loader filter pills - hidden for ATLauncher/Technic (no loader data) and FTB Legacy private */}
        {source !== 'atlauncher' && source !== 'technic' && !(source === 'ftb-legacy' && ftbLegacyCat === 'private') && (
          <div className="flex gap-1.5">
            {LOADERS.map((l) => {
              const active = loader === l.value
              const lc = l.value !== 'all' ? loaderColor(l.value) : null
              return (
                <button
                  key={l.value}
                  onClick={() => setLoader(l.value)}
                  className="px-3.5 py-1 rounded-lg text-xs font-semibold transition-all duration-150"
                  style={
                    active
                      ? lc
                        ? { background: lc.bg, color: lc.text, border: `1px solid ${lc.text}22` }
                        : { background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.2)' }
                      : { background: 'rgba(var(--overlay-rgb),0.03)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }
                  }
                >
                  {l.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-5 pb-6">
        {browseError === 'NO_CF_KEY' && source === 'curseforge' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-4">🔑</div>
            <p className="font-medium text-white mb-1">CurseForge API key required</p>
            <p className="text-sm text-muted max-w-xs mb-4">
              Go to <span className="text-white font-medium">Settings → API Keys</span> and
              add your CurseForge API key to browse CurseForge modpacks.
            </p>
          </div>
        )}
        {browseError && browseError !== 'NO_CF_KEY' && (
          <div
            className="mb-4 flex items-center justify-between gap-3 text-sm rounded-xl px-4 py-3"
            style={{ background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)', color: 'var(--danger-faint)' }}
          >
            <span>{browseError}</span>
            <button onClick={() => setBrowseError(null)} style={{ color: 'var(--danger-soft)', opacity: 0.7 }}>✕</button>
          </div>
        )}

        {loading && results.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && results.length === 0 && !browseError && (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-dim)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="mb-4">
              <circle cx="11" cy="11" r="7"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <p className="text-sm font-medium">No results found</p>
            <p className="text-xs mt-1" style={{ color: 'var(--surface-3)' }}>Try a different search or filter</p>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((p) => (
                <PackCard key={`${p.source}:${p.id}`} pack={p} onInstall={setInstalling} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-8 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border)' }}
                  onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-bright)' } }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-soft)' }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full inline-block border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(156,163,175,0.3)', borderTopColor: 'var(--text-soft)' }} />
                      Loading…
                    </span>
                  ) : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {installing && <InstallModal pack={installing} onClose={() => setInstalling(null)} />}
    </div>
  )
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
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
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
          </div>
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
  const setError = useApp((s) => s.setError)

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

  const openDir = (): void => {
    ;(window.api as any).instance?.openDir?.(instance.id)
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

function InstanceDetailPanel({
  instance,
  onBack
}: {
  instance: Instance
  onBack: () => void
}): JSX.Element {
  const [detailTab, setDetailTab] = useState<'overview' | 'changelog' | 'mods' | 'versions' | 'console' | 'settings'>('overview')
  const [versions, setVersions] = useState<PackVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(true)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [mods, setMods] = useState<PackMod[]>([])
  const [modsLoading, setModsLoading] = useState(false)
  const [modsLoaded, setModsLoaded] = useState(false)
  const [modsError, setModsError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const [localMods, setLocalMods] = useState<{ name: string; size: number }[]>([])
  const [addingMod, setAddingMod] = useState(false)
  const [overview, setOverview] = useState<PackOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [changelogs, setChangelogs] = useState<VersionChangelog[]>([])
  const [changelogLoading, setChangelogLoading] = useState(false)
  const [changelogError, setChangelogError] = useState<string | null>(null)
  const [changelogLoaded, setChangelogLoaded] = useState(false)

  const refreshInstances = useApp((s) => s.refreshInstances)
  const accounts = useApp((s) => s.accounts)
  const progress = useApp((s) => s.progress[instance.id])
  const logs = useApp((s) => s.logs[instance.id]) ?? []
  const setError = useApp((s) => s.setError)

  const signedIn = !!activeAccount(accounts)
  const busy = progress && ['preparing', 'downloading', 'launching'].includes(progress.state)
  const running = progress?.state === 'running'
  const hasModSource = !!instance.externalId && instance.source !== 'manual'

  const latestVersion = versions[0]
  const hasUpdate =
    !!latestVersion && !!instance.packVersionId && latestVersion.id !== instance.packVersionId

  // Fetch versions on mount
  useEffect(() => {
    if (!hasModSource) {
      setVersionsLoading(false)
      return
    }
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
  }, [instance.id, hasModSource])

  // Fetch changelog when Changelog tab is first opened
  useEffect(() => {
    if (detailTab !== 'changelog' || changelogLoaded || changelogLoading || !hasModSource) return
    setChangelogLoading(true)
    setChangelogError(null)
    ;((window.api as any).modpack?.changelog?.(instance.id) ?? Promise.resolve([]))
      .then((data: VersionChangelog[]) => { setChangelogs(data); setChangelogLoaded(true) })
      .catch((e: unknown) => { setChangelogError(e instanceof Error ? e.message : 'Failed to load changelog'); setChangelogLoaded(true) })
      .finally(() => setChangelogLoading(false))
  }, [detailTab, changelogLoaded, changelogLoading, instance.id, hasModSource])

  // Fetch overview when Overview tab is first opened
  useEffect(() => {
    if (detailTab !== 'overview' || overview || overviewLoading || !hasModSource) return
    setOverviewLoading(true)
    setOverviewError(null)
    ;((window.api as any).modpack?.overview?.(instance.id) ?? Promise.resolve(null))
      .then((data: PackOverview | null) => setOverview(data))
      .catch((e: unknown) => setOverviewError(e instanceof Error ? e.message : 'Failed to load overview'))
      .finally(() => setOverviewLoading(false))
  }, [detailTab, overview, overviewLoading, instance.id, hasModSource])

  // Fetch local mods whenever the Mods tab is active
  useEffect(() => {
    if (detailTab !== 'mods') return
    ;(window.api as any).instance?.listLocalMods?.(instance.id)
      .then(setLocalMods)
      .catch(() => {})
  }, [detailTab, instance.id])

  // Fetch mods when Mods tab is first opened
  useEffect(() => {
    if (detailTab !== 'mods' || modsLoaded || modsLoading || !hasModSource) return
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

        {hasModSource && (['mods', 'versions'] as const).map((t) => (
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
            {t === 'mods' && modsLoaded && mods.length > 0 && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)' }}>
                {mods.length}
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
        ) : detailTab === 'mods' ? (
          <div className="space-y-5">
            {/* Mods tab toolbar */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                {hasModSource ? 'Pack mods' : 'Mods'}
              </span>
              <button
                onClick={addMods}
                disabled={addingMod}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
                onMouseEnter={(e) => { if (!addingMod) e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.12)' }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 1v10M1 6h10"/>
                </svg>
                {addingMod ? 'Adding…' : 'Add Mod'}
              </button>
            </div>

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
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: 'var(--text-dim)' }}>
                <div className="text-4xl mb-4">🔧</div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Manual instance</p>
                <p className="text-xs mt-1">Use the Add Mod button above to drop in custom JARs.</p>
              </div>
            )}

            {/* Local / manually added mods */}
            {localMods.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                  Local mods ({localMods.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {localMods.map((mod) => (
                    <div
                      key={mod.name}
                      className="flex items-center gap-3 p-3 rounded-xl group"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-lg"
                        style={{ background: 'var(--surface-2)' }}
                      >
                        🔧
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-bright)' }}>
                          {mod.name.replace(/\.jar$/i, '')}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                          {fmtBytes(mod.size)}
                        </div>
                      </div>
                      <button
                        onClick={() => removeMod(mod.name)}
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

export default function Library(): JSX.Element {
  const [tab, setTab] = useState<Tab>('instances')
  const instances = useApp((s) => s.instances)
  const [showNew, setShowNew] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const pendingLibraryInstanceId = useApp((s) => s.pendingLibraryInstanceId)
  const setPendingLibraryInstanceId = useApp((s) => s.setPendingLibraryInstanceId)
  const refreshInstances = useApp((s) => s.refreshInstances)
  const setError = useApp((s) => s.setError)

  const importPack = useCallback(async (): Promise<void> => {
    const filePath = await window.api.dialog.pickFile([{ name: 'Modpack', extensions: ['mrpack', 'zip'] }])
    if (!filePath) return
    setImporting(true)
    try {
      await (window.api as any).modpack?.importFile?.(filePath)
      await refreshInstances()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }, [refreshInstances, setError])

  // Consume the pending instance ID set by Home page navigation
  useEffect(() => {
    if (!pendingLibraryInstanceId) return
    setTab('instances')
    setSelectedInstanceId(pendingLibraryInstanceId)
    setPendingLibraryInstanceId(null)
  }, [pendingLibraryInstanceId])

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
    </div>
  )
}

function MyInstancesContent({
  showNew,
  setShowNew,
  onManage
}: {
  showNew: boolean
  setShowNew: (v: boolean) => void
  onManage: (id: string) => void
}): JSX.Element {
  const instances = useApp((s) => s.instances)
  const refreshInstances = useApp((s) => s.refreshInstances)
  const accounts = useApp((s) => s.accounts)

  useEffect(() => {
    refreshInstances()
  }, [refreshInstances])

  return (
    <div className="p-6">
      {!activeAccount(accounts) && (
        <div
          className="mb-4 flex items-center gap-2 text-sm rounded-xl px-4 py-2.5"
          style={{
            background: 'rgba(var(--warning-rgb),0.08)',
            border: '1px solid rgba(var(--warning-rgb),0.2)',
            color: 'var(--warning)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Sign in with a Microsoft account (top right) to launch the game.
        </div>
      )}

      {instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">🧱</span>
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No instances yet</p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>
            Click <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>+ New instance</span> above to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {instances.map((i) => (
            <InstanceCard key={i.id} instance={i} onManage={(inst) => onManage(inst.id)} />
          ))}
        </div>
      )}

      {showNew && <NewInstanceModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
