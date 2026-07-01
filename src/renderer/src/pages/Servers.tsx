import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerEntry, ServerStatus } from '@shared/types'

/* ── Ping latency colour ────────────────────────────────────── */
function pingColor(ms?: number): string {
  if (ms === undefined) return 'var(--text-muted)'
  if (ms < 60)  return 'var(--accent-strong)'
  if (ms < 150) return '#eab308'
  if (ms < 300) return '#f97316'
  return 'var(--danger)'
}

function pingLabel(ms?: number): string {
  if (ms === undefined) return '-'
  return `${ms}ms`
}

/* ── Default server icon ────────────────────────────────────── */
function DefaultIcon({ size = 48 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="6" fill="var(--surface-2)"/>
      <rect x="8" y="14" width="32" height="8" rx="2" fill="var(--border)" stroke="var(--border-strong)" strokeWidth="1"/>
      <rect x="8" y="26" width="32" height="8" rx="2" fill="var(--border)" stroke="var(--border-strong)" strokeWidth="1"/>
      <circle cx="13" cy="18" r="2" fill="var(--accent-strong)"/>
      <circle cx="13" cy="30" r="2" fill="var(--accent-strong)"/>
    </svg>
  )
}

/* ── Add Server Modal ───────────────────────────────────────── */
interface AddModalProps {
  onAdd: (data: Omit<ServerEntry, 'id'>) => void
  onClose: () => void
}

function AddModal({ onAdd, onClose }: AddModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('25565')

  const submit = (): void => {
    const trimHost = host.trim()
    if (!trimHost) return
    onAdd({
      name: name.trim() || trimHost,
      host: trimHost,
      port: parseInt(port, 10) || 25565
    })
    onClose()
  }

  const handleKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: 380, background: 'var(--bg-inset)', border: '1px solid var(--border-soft)',
          borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        }}
        onKeyDown={handleKey}
      >
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Add Server</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Server Name</label>
            <input
              autoFocus
              placeholder="My Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = 'var(--accent-strong)' }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Host / IP</label>
              <input
                placeholder="play.example.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-strong)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>
            <div style={{ width: 80 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Port</label>
              <input
                placeholder="25565"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-strong)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-soft)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-soft)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >Cancel</button>
          <button
            onClick={submit}
            style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#000', background: 'var(--accent-strong)', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-darker)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
          >Add Server</button>
        </div>
      </div>
    </div>
  )
}

/* ── Server card ────────────────────────────────────────────── */
interface CardProps {
  server: ServerEntry
  status: (ServerStatus & { loading?: boolean }) | undefined
  onRemove: () => void
  onPing: () => void
}

function ServerCard({ server, status, onRemove, onPing }: CardProps): JSX.Element {
  const [hovered, setHovered] = useState(false)

  const online  = status?.online ?? false
  const loading = status?.loading ?? false

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        borderRadius: 12,
        border: `1px solid ${hovered ? 'var(--border)' : 'var(--border-soft)'}`,
        background: hovered ? 'var(--surface)' : 'var(--bg-inset)',
        transition: 'all 0.15s ease',
        cursor: 'default',
      }}
    >
      {/* Favicon / default icon */}
      <div style={{ flexShrink: 0, width: 48, height: 48 }}>
        {status?.favicon ? (
          <img
            src={status.favicon}
            width={48}
            height={48}
            style={{ borderRadius: 6, imageRendering: 'pixelated', display: 'block' }}
            alt=""
          />
        ) : (
          <DefaultIcon size={48} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {server.name}
          </span>
          {/* Online/offline dot */}
          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: loading ? 'var(--text-muted)' : online ? 'var(--accent-strong)' : 'var(--danger)', boxShadow: online && !loading ? '0 0 6px rgba(var(--accent-rgb),0.5)' : undefined }} />
        </div>

        {/* MOTD */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
          {loading ? 'Pinging…' : status?.motd ?? (status && !online ? (status.error ?? 'Offline') : server.host + (server.port !== 25565 ? `:${server.port}` : ''))}
        </div>

        {/* Host + version row */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>
            {server.host}{server.port !== 25565 ? `:${server.port}` : ''}
          </span>
          {status?.version && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
              {status.version}
            </span>
          )}
        </div>
      </div>

      {/* Right stats */}
      <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {/* Players */}
        {online && status?.players && (
          <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{status.players.online}</span>
            <span style={{ color: 'var(--text-dim)' }}>/{status.players.max}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 3 }}>players</span>
          </div>
        )}

        {/* Ping */}
        {status && (
          <div style={{ fontSize: 12, fontWeight: 600, color: online ? pingColor(status.latencyMs) : 'var(--text-dim)' }}>
            {loading ? '…' : online ? pingLabel(status.latencyMs) : 'Offline'}
          </div>
        )}

        {/* Refresh + Remove buttons */}
        <div style={{ display: 'flex', gap: 4, marginTop: 2, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>
          <button
            onClick={onPing}
            title="Refresh"
            style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid var(--border-soft)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-soft)' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          {server.permanent ? (
            <div
              title="This server is managed by Ender Launcher and cannot be removed"
              style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid var(--border-soft)', color: 'var(--text-dim)', fontSize: 11, display: 'flex', alignItems: 'center' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
          ) : (
            <button
              onClick={onRemove}
              title="Remove"
              style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid var(--border-soft)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--danger)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-soft)' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────── */

type StatusMap = Record<string, ServerStatus & { loading?: boolean }>

export default function Servers(): JSX.Element {
  const [servers, setServers]     = useState<ServerEntry[]>([])
  const [statuses, setStatuses]   = useState<StatusMap>({})
  const [showAdd, setShowAdd]     = useState(false)
  const [pingingAll, setPingingAll] = useState(false)
  const pingControllers = useRef<Map<string, AbortController>>(new Map())

  const load = useCallback(async () => {
    const list = await window.api.servers.list()
    setServers(list)
    return list
  }, [])

  const pingOne = useCallback(async (server: ServerEntry) => {
    setStatuses((prev) => ({ ...prev, [server.id]: { ...prev[server.id], online: false, loading: true } }))
    const result = await window.api.servers.ping(server.host, server.port)
    setStatuses((prev) => ({ ...prev, [server.id]: { ...result, loading: false } }))
  }, [])

  const pingAll = useCallback(async (list: ServerEntry[]) => {
    if (!list.length) return
    setPingingAll(true)
    await Promise.all(list.map((s) => pingOne(s)))
    setPingingAll(false)
  }, [pingOne])

  useEffect(() => {
    load().then((list) => pingAll(list))
    return () => { pingControllers.current.clear() }
  }, [load, pingAll])

  const handleAdd = async (data: Omit<ServerEntry, 'id'>): Promise<void> => {
    const updated = await window.api.servers.add(data)
    setServers(updated)
    // Ping the newly added server
    const newest = updated[updated.length - 1]
    if (newest) void pingOne(newest)
  }

  const handleRemove = async (id: string): Promise<void> => {
    const updated = await window.api.servers.remove(id)
    setServers(updated)
    setStatuses((prev) => { const n = { ...prev }; delete n[id]; return n })
  }

  return (
    <div style={{ padding: '24px 28px', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Servers</h2>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '3px 0 0' }}>
            {servers.length} server{servers.length !== 1 ? 's' : ''} • {servers.filter(s => s.permanent).length} hosted
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Refresh all */}
          <button
            onClick={() => pingAll(servers)}
            disabled={pingingAll}
            title="Refresh all"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              border: '1px solid var(--border-soft)', background: 'transparent',
              color: pingingAll ? 'var(--text-dim)' : 'var(--text-muted)', cursor: pingingAll ? 'default' : 'pointer',
            }}
            onMouseEnter={(e) => { if (!pingingAll) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-soft)'; e.currentTarget.style.color = pingingAll ? 'var(--text-dim)' : 'var(--text-muted)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ animation: pingingAll ? 'spin 1s linear infinite' : undefined }}>
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
            {pingingAll ? 'Pinging…' : 'Refresh'}
          </button>

          {/* Add server */}
          <button
            onClick={() => setShowAdd(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: 'none', background: 'var(--accent-strong)', color: '#000', cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-darker)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Server
          </button>
        </div>
      </div>

      {/* Server list */}
      {servers.length === 0 ? (
        <div
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, color: 'var(--text-dim)',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.2">
            <rect x="2" y="3" width="20" height="7" rx="2"/>
            <rect x="2" y="14" width="20" height="7" rx="2"/>
            <circle cx="6.5" cy="6.5" r="1" fill="var(--border)" stroke="none"/>
            <circle cx="6.5" cy="17.5" r="1" fill="var(--border)" stroke="none"/>
          </svg>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-faint)' }}>No servers yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Click <strong style={{ color: 'var(--text-muted)' }}>Add Server</strong> to track a server's live stats</div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {servers.map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              status={statuses[s.id]}
              onRemove={() => void handleRemove(s.id)}
              onPing={() => void pingOne(s)}
            />
          ))}
        </div>
      )}

      {showAdd && <AddModal onAdd={(d) => void handleAdd(d)} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
