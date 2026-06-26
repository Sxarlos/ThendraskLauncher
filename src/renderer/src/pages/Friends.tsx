import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, Friend, FriendPresence } from '@shared/types'
import { normalizeFriendCode, formatFriendCode } from '@shared/friendCode'

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function loaderBadge(loader: string): { bg: string; text: string } {
  switch (loader) {
    case 'fabric':   return { bg: 'rgba(var(--warning-rgb),0.15)',  text: 'var(--warning)' }
    case 'forge':    return { bg: 'rgba(249,115,22,0.15)',  text: '#f97316' }
    case 'quilt':    return { bg: 'rgba(168,85,247,0.15)',  text: '#a855f7' }
    case 'neoforge': return { bg: 'rgba(var(--danger-rgb),0.15)',   text: 'var(--danger)' }
    default:         return { bg: 'rgba(107,114,128,0.15)', text: 'var(--text-soft)' }
  }
}

/* ── Own status card ───────────────────────────────────── */
function OwnCard({ settings }: { settings: AppSettings }): JSX.Element {
  const [status, setStatus] = useState<FriendPresence | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.api.presence.own().then(setStatus)
  }, [])

  const friendCode = settings.friendCode
    ? formatFriendCode(settings.friendCode.replace(/-/g, ''))
    : null

  const copyCode = (): void => {
    if (!friendCode) return
    navigator.clipboard.writeText(friendCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className="rounded-2xl p-4 mb-5"
      style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.6)' }}
        />
        <span className="font-semibold text-white">You — {status?.username ?? '…'}</span>
        <span className="ml-auto text-xs" style={{ color: 'var(--accent)' }}>Online</span>
      </div>

      {status?.playing ? (
        <p className="text-sm text-muted mb-3">
          Playing <span className="text-white font-medium">{status.playing}</span>
          {status.mcVersion && <span className="text-muted"> · MC {status.mcVersion}</span>}
          {status.loader && status.loader !== 'vanilla' && (() => {
            const c = loaderBadge(status.loader!)
            return (
              <span
                className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize"
                style={{ background: c.bg, color: c.text }}
              >
                {status.loader}
              </span>
            )
          })()}
        </p>
      ) : (
        <p className="text-sm text-muted mb-3">In the launcher</p>
      )}

      {/* Friend code */}
      <div
        className="rounded-lg p-3"
        style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-soft)' }}
      >
        <p className="text-[10px] text-muted uppercase tracking-wide mb-2">Your friend code</p>
        <div className="flex items-center justify-between gap-3">
          <p
            className="text-xl font-mono font-bold tracking-widest"
            style={{ color: 'var(--accent)', letterSpacing: '0.15em' }}
          >
            {friendCode ?? '…'}
          </p>
          <button
            onClick={copyCode}
            disabled={!friendCode}
            className="px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all disabled:opacity-40"
            style={
              copied
                ? { background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }
                : { background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border)' }
            }
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-[10px] text-muted mt-1.5">Share this code — friends enter it when they add you</p>
      </div>
    </div>
  )
}

/* ── Friend card ───────────────────────────────────── */
function FriendCard({
  friend,
  hasRelay,
  onRemove,
}: {
  friend: Friend
  hasRelay: boolean
  onRemove: () => void
}): JSX.Element {
  const [presence, setPresence] = useState<FriendPresence | null>(null)
  const [polling, setPolling] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async (): Promise<void> => {
    if (!hasRelay) return
    setPolling(true)
    try {
      const result = await window.api.friends.poll(friend.code)
      setPresence({ ...result, lastSeen: result.online ? Date.now() : presence?.lastSeen })
    } catch {
      setPresence((prev) => (prev ? { ...prev, online: false } : { online: false }))
    } finally {
      setPolling(false)
    }
  }, [friend.code, hasRelay])

  useEffect(() => {
    poll()
    intervalRef.current = setInterval(poll, 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [poll])

  const online = presence?.online ?? false

  return (
    <div
      className="rounded-2xl p-4 transition-all"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${online ? 'rgba(var(--accent-rgb),0.15)' : 'var(--border-soft)'}`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0 transition-colors"
          style={{
            background: online ? 'var(--accent-strong)' : 'var(--text-dim)',
            boxShadow: online ? '0 0 8px rgba(var(--accent-rgb),0.5)' : 'none',
          }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{friend.name}</span>
            {presence?.username && presence.username !== friend.name && (
              <span className="text-xs text-muted">({presence.username})</span>
            )}
          </div>
          <div className="text-xs font-mono text-muted">{formatFriendCode(friend.code.replace(/-/g, ''))}</div>
        </div>

        <div className="text-right shrink-0">
          {!hasRelay ? (
            <span className="text-xs text-amber-400">No relay</span>
          ) : presence === null ? (
            <span className="text-xs text-muted">Checking…</span>
          ) : online ? (
            <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Online</span>
          ) : (
            <span className="text-xs text-muted">
              Offline{presence.lastSeen ? ` · ${timeSince(presence.lastSeen)}` : ''}
            </span>
          )}
        </div>

        <button
          onClick={poll}
          disabled={polling || !hasRelay}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-white transition-colors disabled:opacity-30"
          style={{ background: 'var(--surface-2)' }}
          title="Refresh"
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={polling ? 'animate-spin' : ''}
          >
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
          </svg>
        </button>
        <button
          onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-red-400 transition-colors text-xs"
          style={{ background: 'var(--surface-2)' }}
          title="Remove friend"
        >
          ✕
        </button>
      </div>

      {online && presence?.playing && (
        <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--border-soft)' }}>
          <span className="text-xs text-muted">Playing</span>
          <span className="text-xs text-white font-medium">{presence.playing}</span>
          {presence.mcVersion && <span className="text-xs text-muted">· MC {presence.mcVersion}</span>}
          {presence.loader && presence.loader !== 'vanilla' && (() => {
            const c = loaderBadge(presence.loader!)
            return (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize" style={{ background: c.bg, color: c.text }}>
                {presence.loader}
              </span>
            )
          })()}
          {presence.since && (
            <span className="ml-auto text-xs text-muted">for {timeSince(presence.since)}</span>
          )}
        </div>
      )}

      {online && !presence?.playing && (
        <div className="mt-3 pt-3 text-xs text-muted" style={{ borderTop: '1px solid var(--border-soft)' }}>
          In the launcher
        </div>
      )}
    </div>
  )
}

/* ── Add friend modal ──────────────────────────────────── */
function AddModal({ onAdd }: { onAdd: (f: Friend[]) => void; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [rawCode, setRawCode] = useState('')

  const bare = normalizeFriendCode(rawCode)
  const codeValid = bare !== null
  const canAdd = name.trim().length > 0 && codeValid

  const handleCodeInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    let val = e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, '')
    // Auto-insert dash after 5 chars
    const stripped = val.replace(/-/g, '')
    if (stripped.length > 5) {
      val = `${stripped.slice(0, 5)}-${stripped.slice(5, 10)}`
    }
    setRawCode(val)
  }

  const add = async (): Promise<void> => {
    if (!canAdd || !bare) return
    const code = formatFriendCode(bare)
    const list = await window.api.friends.add({ name: name.trim(), code })
    onAdd(list)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && canAdd) void add()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div className="w-[400px] rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
        <h2 className="font-bold text-base text-white mb-1">Add friend</h2>
        <p className="text-xs text-muted mb-4">Enter their friend code — they can find it in their Friends tab.</p>

        <label className="block text-xs text-muted mb-1">Display name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Steve"
          className="w-full mb-4 px-3 py-2 rounded-xl text-sm text-white outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-strong)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          autoFocus
        />

        <label className="block text-xs text-muted mb-1">Friend code</label>
        <input
          value={rawCode}
          onChange={handleCodeInput}
          onKeyDown={onKeyDown}
          placeholder="XXXXX-XXXXX"
          maxLength={11}
          className="w-full px-3 py-2.5 rounded-xl text-lg font-mono font-bold text-white outline-none tracking-widest"
          style={{
            background: 'var(--surface-2)',
            border: `1px solid ${
              rawCode.length === 0 ? 'var(--border)' : codeValid ? 'rgba(var(--accent-rgb),0.5)' : 'rgba(var(--danger-rgb),0.4)'
            }`,
            letterSpacing: '0.12em',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-strong)')}
          onBlur={(e) => {
            e.currentTarget.style.borderColor =
              rawCode.length === 0 ? 'var(--border)' : codeValid ? 'rgba(var(--accent-rgb),0.5)' : 'rgba(var(--danger-rgb),0.4)'
          }}
        />
        {rawCode.length > 0 && (
          <p className="text-xs mt-1.5" style={{ color: codeValid ? 'var(--accent)' : 'var(--danger-soft)' }}>
            {codeValid ? '✓ Valid code' : '✕ Invalid — should be 10 letters/numbers'}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => onAdd([])}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface-2)', color: 'var(--text-soft)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => void add()}
            disabled={!canAdd}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-black disabled:opacity-50 transition-all"
            style={{ background: 'var(--accent-strong)' }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--accent)' }}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-strong)')}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── No relay banner ───────────────────────────────────── */
function NoRelayBanner(): JSX.Element {
  return (
    <div
      className="rounded-2xl p-4 mb-5 flex items-start gap-3"
      style={{ background: 'rgba(var(--warning-rgb),0.06)', border: '1px solid rgba(var(--warning-rgb),0.2)' }}
    >
      <span className="text-amber-400 mt-0.5">⚠</span>
      <div>
        <p className="text-sm font-medium text-white mb-1">Relay server not configured</p>
        <p className="text-xs text-muted">
          Friend codes need a relay server to work outside your local network. Deploy the{' '}
          <span className="text-white font-medium">relay/</span> folder to Railway, Render, or Fly.io,
          then paste the URL in{' '}
          <span className="text-white font-medium">Settings → Friends</span>.
        </p>
      </div>
    </div>
  )
}

/* ── Friends page ──────────────────────────────────────── */
export default function Friends(): JSX.Element {
  const [friends, setFriends] = useState<Friend[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    window.api.friends.list().then(setFriends)
    window.api.settings.get().then(setSettings)
  }, [])

  const hasRelay = Boolean(settings?.relayUrl)

  const remove = async (id: string): Promise<void> => {
    const list = await window.api.friends.remove(id)
    setFriends(list)
  }

  return (
    <div className="flex flex-col h-full">
      <div
        className="shrink-0 flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--border-soft)' }}
      >
        <div>
          <h1 className="font-semibold text-white">Friends</h1>
          <p className="text-xs text-muted mt-0.5">Share your code — friends add you by code, not IP</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-black"
          style={{ background: 'var(--accent-strong)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-strong)')}
        >
          + Add friend
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-5 pb-6">
        {settings && <OwnCard settings={settings} />}

        {!hasRelay && <NoRelayBanner />}

        {friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-5xl mb-4">👥</div>
            <p className="font-medium text-white mb-1">No friends added yet</p>
            <p className="text-sm text-muted max-w-xs">
              Click <span className="text-white font-medium">+ Add friend</span> and enter their
              friend code.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                Friends — {friends.length}
              </span>
            </div>
            <div className="space-y-3">
              {friends.map((f) => (
                <FriendCard
                  key={f.id}
                  friend={f}
                  hasRelay={hasRelay}
                  onRemove={() => void remove(f.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onAdd={(list) => { if (list.length > 0) setFriends(list); setShowAdd(false) }}
        />
      )}
    </div>
  )
}
