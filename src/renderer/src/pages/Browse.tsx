import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowseParams, ModpackResult } from '@shared/types'
import { useApp } from '../store'

type Source = 'modrinth' | 'curseforge'
type LoaderFilter = 'all' | 'fabric' | 'forge' | 'quilt' | 'neoforge'

const LOADERS: { value: LoaderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'forge', label: 'Forge' },
  { value: 'quilt', label: 'Quilt' },
  { value: 'neoforge', label: 'NeoForge' },
]

const COMMON_VERSIONS = [
  '1.21.4', '1.21.1', '1.21', '1.20.4', '1.20.1', '1.20',
  '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.12.2', '1.7.10',
]

const PAGE_SIZE = 20

function fmtDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
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

/* ── Skeleton card ─────────────────────────────────────────── */
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

/* ── Install modal ─────────────────────────────────────────── */
function InstallModal({ pack, onClose }: { pack: ModpackResult; onClose: () => void }): JSX.Element {
  const refreshInstances = useApp((s) => s.refreshInstances)
  const setError = useApp((s) => s.setError)
  const [name, setName] = useState(pack.name)
  const [busy, setBusy] = useState(false)

  const latestMc = pack.mcVersions[0] ?? ''
  const loader = (pack.loaders[0] ?? 'fabric') as any

  const install = async (): Promise<void> => {
    setBusy(true)
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
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-[420px] rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
        {/* Pack info */}
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

/* ── Pack card ─────────────────────────────────────────────── */
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
      {/* Blurred icon background atmosphere */}
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
      {/* Gradient to ensure legibility */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(160deg, rgba(10,12,16,0.4) 0%, rgba(10,12,16,0.85) 100%)' }} />

      {/* Card content */}
      <div className="relative z-10 p-4 flex flex-col gap-3 h-full">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="w-14 h-14 rounded-xl overflow-hidden shrink-0"
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--overlay-rgb),0.06)' }}
          >
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
                : { background: 'rgba(249,115,22,0.15)', color: '#fb923c' }
            }
          >
            {pack.source === 'modrinth' ? 'MR' : 'CF'}
          </span>
        </div>

        {/* Description */}
        <p className="text-[13px] leading-relaxed line-clamp-2 flex-1" style={{ color: 'var(--text-soft)' }}>
          {pack.description}
        </p>

        {/* Loader + category badges */}
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

        {/* MC version */}
        {pack.mcVersions.length > 0 && (
          <div className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
            MC {pack.mcVersions[0]}
            {pack.mcVersions.length > 1 && ` – ${pack.mcVersions[pack.mcVersions.length - 1]}`}
          </div>
        )}

        {/* Actions */}
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

/* ── Browse page ───────────────────────────────────────────── */
export default function Browse(): JSX.Element {
  const [source, setSource] = useState<Source>('modrinth')
  const [query, setQuery] = useState('')
  const [loader, setLoader] = useState<LoaderFilter>('all')
  const [mcVersion, setMcVersion] = useState('')
  const [results, setResults] = useState<ModpackResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [installing, setInstalling] = useState<ModpackResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (
    q: string, src: Source, ldr: LoaderFilter, ver: string, off: number, append: boolean
  ): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const params: BrowseParams = {
        query: q,
        loader: ldr === 'all' ? undefined : ldr,
        mcVersion: ver || undefined,
        limit: PAGE_SIZE,
        offset: off,
      }
      const fn = src === 'modrinth' ? window.api.browse.modrinth : window.api.browse.curseforge
      const data = await fn(params)
      setResults((prev) => append ? [...prev, ...data] : data)
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setOffset(0)
    setResults([])
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(query, source, loader, mcVersion, 0, false)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, source, loader, mcVersion, doSearch])

  const loadMore = (): void => {
    const next = offset + PAGE_SIZE
    setOffset(next)
    doSearch(query, source, loader, mcVersion, next, true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 px-6 pt-5 pb-4 space-y-3" style={{ borderBottom: '1px solid var(--border-soft)' }}>

        {/* Row 1: source toggle + search + version */}
        <div className="flex items-center gap-3">
          {/* Source pills */}
          <div className="flex gap-1 p-1 rounded-xl shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
            {(['modrinth', 'curseforge'] as Source[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200"
                style={
                  source === s
                    ? s === 'modrinth'
                      ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', boxShadow: 'inset 0 1px 0 rgba(var(--accent-rgb),0.1)' }
                      : { background: 'rgba(249,115,22,0.15)', color: '#fb923c', boxShadow: 'inset 0 1px 0 rgba(249,115,22,0.1)' }
                    : { background: 'transparent', color: 'var(--text-muted)' }
                }
              >
                {s === 'modrinth' ? 'Modrinth' : 'CurseForge'}
              </button>
            ))}
          </div>

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

        {/* Row 2: loader filter pills */}
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
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-5 pb-6">

        {/* Error */}
        {error && (
          <div
            className="mb-4 flex items-center justify-between gap-3 text-sm rounded-xl px-4 py-3"
            style={{ background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)', color: 'var(--danger-faint)' }}
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ color: 'var(--danger-soft)', opacity: 0.7 }}>✕</button>
          </div>
        )}

        {/* Skeleton loading */}
        {loading && results.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-dim)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="mb-4">
              <circle cx="11" cy="11" r="7"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <p className="text-sm font-medium">No results found</p>
            <p className="text-xs mt-1" style={{ color: 'var(--surface-3)' }}>Try a different search or filter</p>
          </div>
        )}

        {/* Cards */}
        {results.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((p) => (
                <PackCard key={`${p.source}:${p.id}`} pack={p} onInstall={setInstalling} />
              ))}
            </div>

            {/* Load more */}
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
