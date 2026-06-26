import { useCallback, useEffect, useState } from 'react'
import type { MinecraftCape, MinecraftProfile } from '@shared/types'
import SkinViewer3D from './SkinViewer3D'

interface Props {
  uuid: string
  username: string
  onClose: () => void
  onReauth: () => void
}

/*
 * Minecraft cape texture is 64×32 px.
 * Front face: x=1, y=1, w=10, h=16.
 * Display at 5× scale → 50×80 px container.
 *
 * The texture URL from Mojang is http:// — convert to https:// so our CSP
 * (img-src https:) doesn't silently block it. CSS background-image avoids
 * canvas CORS restrictions entirely.
 */
function toHttps(url: string): string {
  return url.replace(/^http:\/\//, 'https://')
}

/* ── Cape thumbnail ─────────────────────────────────────────── */

function CapeTile({
  cape,
  active,
  onSelect,
}: {
  cape: MinecraftCape
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={cape.alias}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '10px 8px',
        borderRadius: 10,
        border: active
          ? '2px solid var(--accent-strong)'
          : `2px solid ${hovered ? 'var(--border)' : 'var(--border-soft)'}`,
        background: active
          ? 'rgba(var(--accent-rgb),0.08)'
          : hovered
          ? 'rgba(var(--overlay-rgb),0.04)'
          : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        minWidth: 72,
      }}
    >
      {/* Front-face crop via CSS background — no CORS, no canvas taint */}
      <div
        style={{
          width: 50,
          height: 80,
          borderRadius: 4,
          border: '1px solid var(--border-soft)',
          /* Scale the 64×32 texture to 320×160 (5×), then offset so only
             the front-face region (x=1,y=1 w=10 h=16) fills the container */
          backgroundImage: `url("${toHttps(cape.url)}")`,
          backgroundSize: '320px 160px',
          backgroundPosition: '-5px -5px',
          imageRendering: 'pixelated',
        }}
      />

      <span
        style={{
          fontSize: 10,
          color: active ? 'var(--accent-strong)' : 'var(--text-soft)',
          fontWeight: active ? 600 : 400,
          maxWidth: 72,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {cape.alias || 'Cape'}
      </span>

      {active && (
        <div
          style={{
            fontSize: 9,
            color: 'var(--accent-strong)',
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          ● ACTIVE
        </div>
      )}
    </button>
  )
}

/* ── No cape tile ───────────────────────────────────────────── */

function NoCapeTitle({
  active,
  onSelect,
}: {
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '10px 8px',
        borderRadius: 10,
        border: active
          ? '2px solid var(--accent-strong)'
          : `2px solid ${hovered ? 'var(--border)' : 'var(--border-soft)'}`,
        background: active
          ? 'rgba(var(--accent-rgb),0.08)'
          : hovered
          ? 'rgba(var(--overlay-rgb),0.04)'
          : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        minWidth: 72,
      }}
    >
      <div
        style={{
          width: 52,
          height: 64,
          borderRadius: 4,
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
      <span style={{ fontSize: 10, color: active ? 'var(--accent-strong)' : 'var(--text-soft)', fontWeight: active ? 600 : 400 }}>
        None
      </span>
      {active && (
        <div style={{ fontSize: 9, color: 'var(--accent-strong)', fontWeight: 700 }}>● ACTIVE</div>
      )}
    </button>
  )
}

/* ── Main modal ─────────────────────────────────────────────── */

export default function ProfileModal({ uuid, username, onClose, onReauth }: Props): JSX.Element {
  const [profile, setProfile]         = useState<MinecraftProfile | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [capeLoading, setCapeLoading] = useState(false)

  /* Active cape URL for the skin viewer */
  const activeCape = profile?.capes.find((c) => c.state === 'ACTIVE')

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await window.api.profile.get()
      setProfile(p)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load profile.'
      if (msg.includes('SESSION_EXPIRED:')) {
        setSessionExpired(true)
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadProfile() }, [loadProfile])

  /* Close on backdrop click */
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose()
  }

  /* Close on Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const selectCape = async (capeId: string | null): Promise<void> => {
    if (capeLoading) return
    setCapeLoading(true)
    try {
      await window.api.profile.setCape(capeId)
      /* Optimistically update local state */
      setProfile((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          capes: prev.capes.map((c) => ({
            ...c,
            state: c.id === capeId ? 'ACTIVE' : 'INACTIVE',
          })),
        }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update cape.')
    } finally {
      setCapeLoading(false)
    }
  }

  const handleCapeClick = (cape: MinecraftCape): void => {
    if (cape.state === 'ACTIVE') {
      /* Clicking the active cape unequips it */
      void selectCape(null)
    } else {
      void selectCape(cape.id)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={handleBackdrop}
    >
      <div
        style={{
          width: 720,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 48px)',
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-soft)',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
              {username}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, fontFamily: 'monospace' }}>
              {uuid}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid var(--border-soft)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-soft)'; e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left — 3D skin viewer */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(ellipse at center, #0f1520 0%, #060810 100%)',
              borderRight: '1px solid var(--border-soft)',
              padding: 16,
            }}
          >
            <SkinViewer3D
              uuid={uuid}
              capeUrl={activeCape?.url ?? null}
              width={220}
              height={340}
            />
          </div>

          {/* Right — cape selector + info */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {loading && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
                Loading profile…
              </div>
            )}

            {sessionExpired && (
              <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    padding: '12px 14px', borderRadius: 8,
                    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
                    color: '#fde68a', fontSize: 12, lineHeight: 1.5,
                  }}
                >
                  Your Microsoft session for <strong>{username}</strong> has expired.
                  Sign in again to view your skin and capes.
                </div>
                <button
                  onClick={() => { onClose(); onReauth() }}
                  style={{
                    padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent-strong)',
                    border: '1px solid rgba(var(--accent-rgb),0.25)', cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.22)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.12)' }}
                >
                  Sign in again
                </button>
              </div>
            )}

            {error && !sessionExpired && (
              <div
                style={{
                  padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                  background: 'rgba(var(--danger-rgb),0.08)', border: '1px solid rgba(var(--danger-rgb),0.2)',
                  color: 'var(--danger-faint)', fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            {profile && !loading && (
              <>
                {/* Skin variant badge */}
                {profile.skins.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Skin
                    </div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 10px',
                        borderRadius: 6,
                        background: 'var(--surface)',
                        border: '1px solid var(--border-soft)',
                        fontSize: 12,
                        color: 'var(--text-soft)',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-strong)" strokeWidth="1.5">
                        <circle cx="12" cy="8" r="4"/>
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                      </svg>
                      {profile.skins.find((s) => s.state === 'ACTIVE')?.variant === 'SLIM'
                        ? 'Alex model (slim arms)'
                        : 'Steve model (classic arms)'}
                    </div>
                  </div>
                )}

                {/* Cape selector */}
                <div>
                  <div
                    style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                      letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span>Capes</span>
                    {capeLoading && (
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none' }}>
                        Updating…
                      </span>
                    )}
                  </div>

                  {profile.capes.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '16px 0' }}>
                      No capes available on this account.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {/* None option */}
                        <NoCapeTitle
                          active={!activeCape}
                          onSelect={() => void selectCape(null)}
                        />

                        {profile.capes.map((cape) => (
                          <CapeTile
                            key={cape.id}
                            cape={cape}
                            active={cape.state === 'ACTIVE'}
                            onSelect={() => handleCapeClick(cape)}
                          />
                        ))}
                      </div>

                      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 16, lineHeight: 1.5 }}>
                        Click a cape to equip it. Click the active cape or{' '}
                        <strong style={{ color: 'var(--text-muted)' }}>None</strong> to unequip.
                        Changes apply immediately in-game.
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
