import { useEffect, useState } from 'react'
import type { Instance } from '@shared/types'
import { activeAccount, useApp } from '../store'
import NewInstanceModal from '../components/NewInstanceModal'
import { ipcError } from '../lib/ipcError'
import { formatPlayTime } from '../lib/formatPlayTime'
import { progressLabel } from './libraryUtils'
/* ════════════════════════════════════════════════
   MY INSTANCES tab
════════════════════════════════════════════════ */

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
    const confirmed = window.confirm(
      `Delete “${instance.name}” and all of its local files? This cannot be undone.`
    )
    if (!confirmed) return
    try {
      await window.api.instances.remove(instance.id, true)
      await refreshInstances()
    } catch (e) {
      setError(ipcError(e))
    }
  }

  const toggleFavorite = async (): Promise<void> => {
    try {
      await window.api.instances.update(instance.id, { favorite: !instance.favorite })
      await refreshInstances()
    } catch (e) {
      setError(ipcError(e))
    }
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
          onClick={(e) => { e.stopPropagation(); void toggleFavorite() }}
          className="px-3 py-2 rounded-xl text-sm transition-colors"
          style={{ background: 'var(--surface-2)', color: instance.favorite ? 'var(--warning)' : 'var(--text-muted)', border: '1px solid var(--border-soft)' }}
          title={instance.favorite ? 'Remove from favourites' : 'Add to favourites'}
        >
          {instance.favorite ? '★' : '☆'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); void remove() }}
          disabled={running || busy}
          className="px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-40"
          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--danger-rgb),0.12)'; e.currentTarget.style.color = 'var(--danger-soft)'; e.currentTarget.style.borderColor = 'rgba(var(--danger-rgb),0.2)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-soft)' }}
          title={running || busy ? 'Stop the instance before deleting it' : 'Delete instance'}
        >
          🗑
        </button>
      </div>
    </div>
  )
}

export default function MyInstancesContent({
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
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()
  const visibleInstances = instances
    .filter((instance) => !normalizedQuery || [
      instance.name,
      instance.mcVersion,
      instance.loader,
      instance.group ?? '',
      ...(instance.tags ?? [])
    ].some((value) => value.toLowerCase().includes(normalizedQuery)))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))

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

      {instances.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search instances, groups, tags, versions…"
          className="w-full mb-4 px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', color: 'var(--text-bright)' }}
        />
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
          {visibleInstances.map((i) => (
            <InstanceCard key={i.id} instance={i} onManage={(inst) => onManage(inst.id)} />
          ))}
        </div>
      )}

      {showNew && <NewInstanceModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
