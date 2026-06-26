import { useEffect, useRef, useState } from 'react'
import { activeAccount, useApp } from '../store'
import ProfileModal from './ProfileModal'

export default function AccountSwitcher(): JSX.Element {
  const accounts = useApp((s) => s.accounts)
  const refreshAccounts = useApp((s) => s.refreshAccounts)
  const setError = useApp((s) => s.setError)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const active = activeAccount(accounts)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const login = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await window.api.accounts.login()
      await refreshAccounts()
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (id: string): Promise<void> => {
    await window.api.accounts.setActive(id)
    await refreshAccounts()
    setOpen(false)
  }

  const remove = async (id: string): Promise<void> => {
    await window.api.accounts.remove(id)
    await refreshAccounts()
  }

  /*
   * msmc returns UUIDs WITHOUT dashes (32 hex chars).
   * mc-heads.net and crafatar both need the dashed form.
   */
  const dashedUuid = (id: string): string =>
    id.includes('-')
      ? id
      : `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`

  /* mc-heads.net is highly reliable and returns a clean isometric head PNG */
  const headUrl = (id: string): string =>
    `https://mc-heads.net/head/${dashedUuid(id)}/40`

  function Avatar({ id, username, size }: { id: string; username: string; size: number }): JSX.Element {
    const [src, setSrc] = useState(headUrl(id))
    const [failed, setFailed] = useState(false)

    const handleError = (): void => {
      /* Try crafatar as fallback before giving up */
      if (!src.includes('crafatar')) {
        setSrc(`https://crafatar.com/renders/head/${dashedUuid(id)}?size=64&overlay`)
      } else {
        setFailed(true)
      }
    }

    if (failed) {
      /* Only show letter as absolute last resort */
      const color = `hsl(${(username.charCodeAt(0) * 37) % 360},55%,40%)`
      return (
        <div
          style={{
            width: size, height: size, borderRadius: 4, flexShrink: 0,
            background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.45, fontWeight: 700, color: '#fff',
          }}
        >
          {username[0]?.toUpperCase()}
        </div>
      )
    }

    return (
      <img
        src={src}
        width={size}
        height={size}
        style={{ borderRadius: 4, flexShrink: 0 }}
        alt={username}
        onError={handleError}
      />
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-panel2 hover:bg-border text-sm transition-colors"
        style={{ border: '1px solid var(--border-soft)' }}
      >
        {active ? (
          <>
            <Avatar id={active.id} username={active.username} size={28} />
            <span className="font-medium">{active.username}</span>
          </>
        ) : (
          <span className="text-muted">Not signed in</span>
        )}
        <span className="text-muted text-xs">▾</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-xl shadow-xl p-2 z-20"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
        >
          <div className="text-xs text-muted px-2 pb-1 pt-0.5 font-medium tracking-wide uppercase" style={{ fontSize: 10 }}>Accounts</div>
          {accounts.length === 0 && (
            <div className="px-2 py-2 text-sm text-muted">No accounts yet.</div>
          )}
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-panel2 group cursor-pointer"
            >
              <Avatar id={a.id} username={a.username} size={32} />
              <button className="flex-1 text-left text-sm leading-tight" onClick={() => pick(a.id)}>
                <div className="font-medium">{a.username}</div>
                {a.active && (
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--accent-strong)' }}>● Active</div>
                )}
              </button>
              <button
                onClick={() => remove(a.id)}
                className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 text-xs px-1 transition-opacity"
                title="Remove account"
              >
                ✕
              </button>
            </div>
          ))}
          {/* View Profile button (only when an account is active) */}
          {active && (
            <button
              onClick={() => { setOpen(false); setShowProfile(true) }}
              className="w-full mt-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors text-left flex items-center gap-2"
              style={{ background: 'rgba(var(--overlay-rgb),0.03)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--overlay-rgb),0.06)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--overlay-rgb),0.03)'; e.currentTarget.style.color = 'var(--text-soft)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              View Profile &amp; Capes
            </button>
          )}

          <button
            onClick={login}
            disabled={busy}
            className="w-full mt-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 transition-colors"
            style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent-strong)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.12)' }}
          >
            {busy ? 'Opening Microsoft login…' : '+ Add Microsoft account'}
          </button>
        </div>
      )}

      {showProfile && active && (
        <ProfileModal
          uuid={dashedUuid(active.id)}
          username={active.username}
          onClose={() => setShowProfile(false)}
          onReauth={() => { setShowProfile(false); void login() }}
        />
      )}
    </div>
  )
}
