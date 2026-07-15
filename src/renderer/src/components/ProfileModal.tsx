import { useCallback, useEffect, useState } from 'react'
import type { MinecraftCape, MinecraftProfile, SavedSkin } from '@shared/types'
import SkinViewer3D from './SkinViewer3D'
import SkinBody from './SkinBody'
import { useApp } from '../store'

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
 * The texture URL from Mojang is http:// - convert to https:// so our CSP
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
  selected,
  onSelect,
}: {
  cape: MinecraftCape
  /** Currently equipped on the account (drives the ● ACTIVE badge). */
  active: boolean
  /** Currently being previewed in the viewer (drives the highlight). */
  selected: boolean
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
        border: selected
          ? '2px solid var(--accent-strong)'
          : `2px solid ${hovered ? 'var(--border)' : 'var(--border-soft)'}`,
        background: selected
          ? 'rgba(var(--accent-rgb),0.08)'
          : hovered
          ? 'rgba(var(--overlay-rgb),0.04)'
          : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        width: 80,
      }}
    >
      {/* Front-face crop via CSS background - no CORS, no canvas taint.
          Percentages (not pixels) keep the crop correct for any cape texture
          resolution — 64×32, 128×64, 512×256 — so every cape renders at the
          same scale in the box. */}
      <div
        style={{
          width: 50,
          height: 80,
          borderRadius: 4,
          border: '1px solid var(--border-soft)',
          /* Front-face region is x=1,y=1 w=10 h=16 within the 64×32 layout.
             backgroundSize 640%×200% scales the 10-wide face to the box width;
             the position percentages land that face in the frame. */
          backgroundImage: `url("${toHttps(cape.url)}")`,
          backgroundSize: '640% 200%',
          backgroundPosition: '1.852% 6.25%',
          imageRendering: 'pixelated',
        }}
      />

      <span
        style={{
          fontSize: 10,
          color: selected ? 'var(--accent-strong)' : 'var(--text-soft)',
          fontWeight: selected ? 600 : 400,
          maxWidth: 64,
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
  selected,
  onSelect,
}: {
  /** No cape is equipped on the account (drives the ● ACTIVE badge). */
  active: boolean
  /** "None" is currently being previewed (drives the highlight). */
  selected: boolean
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
        border: selected
          ? '2px solid var(--accent-strong)'
          : `2px solid ${hovered ? 'var(--border)' : 'var(--border-soft)'}`,
        background: selected
          ? 'rgba(var(--accent-rgb),0.08)'
          : hovered
          ? 'rgba(var(--overlay-rgb),0.04)'
          : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        width: 80,
      }}
    >
      <div
        style={{
          width: 50,
          height: 80,
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
      <span style={{ fontSize: 10, color: selected ? 'var(--accent-strong)' : 'var(--text-soft)', fontWeight: selected ? 600 : 400 }}>
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
  const liteMode = useApp((s) => s.liteMode)
  const [profile, setProfile]         = useState<MinecraftProfile | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [capeLoading, setCapeLoading] = useState(false)
  const [skinPath, setSkinPath]       = useState<string | null>(null)
  const [skinPreview, setSkinPreview] = useState<string | null>(null)
  const [skinVariant, setSkinVariant] = useState<'CLASSIC' | 'SLIM'>('CLASSIC')
  const [skinLoading, setSkinLoading] = useState(false)
  const [savedSkins, setSavedSkins]   = useState<SavedSkin[]>([])
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)
  /* Preview-only cape visibility in the 3D viewer — does NOT change the cape
     equipped on the account, so users can see their skin with/without the cape
     without unequipping and re-equipping it. */
  const [showCape, setShowCape]       = useState(true)
  /* Which cape is being previewed in the viewer, independent of what's equipped:
       undefined → follow the equipped cape
       null      → preview "no cape"
       <id>      → preview that owned-but-not-equipped cape
     Lets users try a cape on before committing it to the account. */
  const [previewCapeId, setPreviewCapeId] = useState<string | null | undefined>(undefined)

  /* Active cape URL for the skin viewer */
  const activeCape = profile?.capes.find((c) => c.state === 'ACTIVE')
  const activeSkin = profile?.skins.find((s) => s.state === 'ACTIVE')

  /* Cape shown in the viewer: an explicit preview (id/none) overrides the
     equipped cape. selectedCapeId drives which tile is highlighted. */
  const activeCapeId = activeCape?.id ?? null
  const selectedCapeId = previewCapeId === undefined ? activeCapeId : previewCapeId
  const previewedCape =
    selectedCapeId === null ? undefined : profile?.capes.find((c) => c.id === selectedCapeId)
  /* True when the preview is a cape that isn't the one currently equipped. */
  const previewDiffers = previewCapeId !== undefined && previewCapeId !== activeCapeId

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    const savedSkinsApi = window.api.profile.listSavedSkins
    // The saved-skin library lives on disk and needs no Minecraft session.
    // Load it independently of the profile so an expired Microsoft token
    // never hides skins the user already saved.
    const [profileResult, savedResult] = await Promise.allSettled([
      window.api.profile.get(),
      typeof savedSkinsApi === 'function' ? savedSkinsApi() : Promise.resolve([])
    ])
    if (savedResult.status === 'fulfilled') setSavedSkins(savedResult.value)
    if (profileResult.status === 'fulfilled') {
      const p = profileResult.value
      setProfile(p)
      setSkinVariant(p.skins.find((s) => s.state === 'ACTIVE')?.variant ?? 'CLASSIC')
    } else {
      const e = profileResult.reason
      const msg = e instanceof Error ? e.message : 'Failed to load profile.'
      if (msg.includes('SESSION_EXPIRED:')) {
        setSessionExpired(true)
      } else {
        setError(msg)
      }
    }
    setLoading(false)
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

  const selectCape = async (capeId: string | null): Promise<boolean> => {
    if (capeLoading) return false
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
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update cape.')
      return false
    } finally {
      setCapeLoading(false)
    }
  }

  /* Preview a cape in the viewer without equipping it on the account. Passing
     null previews "no cape". */
  const previewCape = (capeId: string | null): void => {
    setPreviewCapeId(capeId)
    if (capeId !== null) setShowCape(true)
  }

  /* Commit the currently previewed cape to the account, then fall back to
     following the equipped cape again. */
  const equipPreviewedCape = async (): Promise<void> => {
    if (previewCapeId === undefined) return
    const ok = await selectCape(previewCapeId)
    if (ok) setPreviewCapeId(undefined)
  }

  const chooseSkin = async (): Promise<void> => {
    setError(null)
    const filePath = await window.api.dialog.pickFile([{ name: 'Minecraft skin', extensions: ['png'] }])
    if (!filePath) return
    try {
      const preview = await window.api.profile.previewSkin(filePath)
      setSkinPath(filePath)
      setSkinPreview(preview.dataUrl)
      setSelectedSavedId(null)
    } catch (e) {
      setSkinPath(null)
      setSkinPreview(null)
      setError(e instanceof Error ? e.message : 'Failed to read the selected skin.')
    }
  }

  const applySkin = async (): Promise<void> => {
    if ((!skinPath && !selectedSavedId) || skinLoading) return
    setSkinLoading(true)
    setError(null)
    try {
      const updated = selectedSavedId
        ? await window.api.profile.uploadSavedSkin(selectedSavedId, skinVariant)
        : await window.api.profile.uploadSkin(skinPath!, skinVariant)
      setProfile(updated)
      // Applying a freshly-chosen file also saves it to the library, so users
      // don't have to save separately. Skipped when the skin came from the
      // library or is already saved. Non-fatal — the upload already succeeded.
      if (skinPath && !savedSkins.some((s) => s.dataUrl === skinPreview)) {
        try {
          setSavedSkins(await window.api.profile.saveSkin(skinPath, skinVariant))
        } catch {
          // Leave the manual "Save to library" button as a fallback.
        }
      }
      setSkinPath(null)
      setSkinPreview(null)
      setSelectedSavedId(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to upload skin.'
      if (msg.includes('SESSION_EXPIRED:')) setSessionExpired(true)
      else setError(msg)
    } finally {
      setSkinLoading(false)
    }
  }

  const saveSelectedSkin = async (): Promise<void> => {
    if (!skinPath || skinLoading) return
    setSkinLoading(true)
    setError(null)
    try {
      setSavedSkins(await window.api.profile.saveSkin(skinPath, skinVariant))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save skin.')
    } finally {
      setSkinLoading(false)
    }
  }

  const chooseSavedSkin = (skin: SavedSkin): void => {
    setSelectedSavedId(skin.id)
    setSkinPath(null)
    setSkinPreview(skin.dataUrl)
    setSkinVariant(skin.variant)
    setError(null)
  }

  const removeSavedSkin = async (id: string): Promise<void> => {
    try {
      setSavedSkins(await window.api.profile.deleteSavedSkin(id))
      if (selectedSavedId === id) {
        setSelectedSavedId(null)
        setSkinPreview(null)
        setSkinVariant(activeSkin?.variant ?? 'CLASSIC')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove saved skin.')
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
          {/* Left - 3D skin viewer */}
          <div
            style={{
              width: 260,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: 'radial-gradient(ellipse at center, #0f1520 0%, #060810 100%)',
              borderRight: '1px solid var(--border-soft)',
              padding: 16,
            }}
          >
            {liteMode ? (
              /* Lite mode: skip mounting the 3D viewer entirely so three.js
                 never loads into memory. Static placeholder matches the
                 same footprint as the real viewer. */
              <div
                style={{
                  width: 220,
                  height: 340,
                  borderRadius: 8,
                  background: 'var(--surface)',
                  border: '1px solid var(--border-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: '50%',
                    background: `hsl(${(username.charCodeAt(0) * 37) % 360},55%,40%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 40,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  {username[0]?.toUpperCase()}
                </div>
              </div>
            ) : (
              <SkinViewer3D
                uuid={uuid}
                skinUrl={skinPreview ?? activeSkin?.url ?? null}
                variant={skinPreview ? skinVariant : activeSkin?.variant}
                capeUrl={showCape ? (previewedCape?.url ?? null) : null}
                width={220}
                height={340}
              />
            )}

            {/* Preview toggle — only meaningful when a cape is in view. Hides
                the cape in the viewer without touching the account. */}
            {!liteMode && previewedCape && (
              <button
                onClick={() => setShowCape((v) => !v)}
                title="Toggle the cape in this preview only — your equipped cape stays unchanged"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                  background: showCape ? 'rgba(var(--accent-rgb),0.12)' : 'var(--surface)',
                  border: showCape ? '1px solid rgba(var(--accent-rgb),0.3)' : '1px solid var(--border-soft)',
                  color: showCape ? 'var(--accent-strong)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: showCape ? 'var(--accent-strong)' : 'var(--text-faint)',
                  }}
                />
                Cape {showCape ? 'on' : 'off'}
              </button>
            )}
          </div>

          {/* Right - cape selector + info */}
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
                  Your saved skins are still available below — sign in again to
                  apply a skin to your account or manage capes.
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

            {!loading && (
              <>
                {/* Skin changer + local library — works without a live session */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Skin</span>
                    {skinLoading && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none' }}>Uploading…</span>}
                  </div>

                  <button
                    onClick={() => void chooseSkin()}
                    disabled={skinLoading}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border-soft)', color: 'var(--text-soft)', cursor: skinLoading ? 'default' : 'pointer', fontSize: 12, textAlign: 'left' }}
                  >
                    {skinPath ? skinPath.split(/[\\/]/).pop() : selectedSavedId ? 'Saved skin selected' : 'Choose a PNG skin…'}
                  </button>

                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {(['CLASSIC', 'SLIM'] as const).map((variant) => {
                      const selected = skinVariant === variant
                      return (
                        <button
                          key={variant}
                          onClick={() => setSkinVariant(variant)}
                          disabled={skinLoading}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: selected ? '1px solid var(--accent-strong)' : '1px solid var(--border-soft)', background: selected ? 'rgba(var(--accent-rgb),0.1)' : 'transparent', color: selected ? 'var(--accent-strong)' : 'var(--text-muted)', cursor: skinLoading ? 'default' : 'pointer', fontSize: 11, fontWeight: selected ? 600 : 400 }}
                        >
                          {variant === 'CLASSIC' ? 'Steve · Classic' : 'Alex · Slim'}
                        </button>
                      )
                    })}
                  </div>

                  {(skinPath || selectedSavedId) ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => void applySkin()}
                        disabled={skinLoading || !profile}
                        title={!profile ? 'Sign in again to apply a skin to your account' : undefined}
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 8, background: 'rgba(var(--accent-rgb),0.14)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent-strong)', cursor: (skinLoading || !profile) ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, opacity: !profile ? 0.5 : 1 }}
                      >
                        {skinLoading ? 'Uploading…' : 'Apply skin'}
                      </button>
                      <button
                        onClick={() => { setSkinPath(null); setSkinPreview(null); setSelectedSavedId(null); setSkinVariant(activeSkin?.variant ?? 'CLASSIC') }}
                        disabled={skinLoading}
                        style={{ padding: '9px 12px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-soft)', color: 'var(--text-muted)', cursor: skinLoading ? 'default' : 'pointer', fontSize: 12 }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '9px 0 0', lineHeight: 1.5 }}>
                      64×64 PNG recommended. Legacy 64×32 skins are also supported.
                    </p>
                  )}

                  {skinPath && !savedSkins.some((skin) => skin.dataUrl === skinPreview) && (
                    <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '8px 0 0', lineHeight: 1.4 }}>
                      Applying will also save this skin to your library. Or save it now without applying:
                    </p>
                  )}

                  {skinPath && (
                    <button
                      onClick={() => void saveSelectedSkin()}
                      disabled={skinLoading || savedSkins.some((skin) => skin.dataUrl === skinPreview)}
                      style={{ width: '100%', marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-soft)', color: 'var(--text-muted)', cursor: skinLoading ? 'default' : 'pointer', fontSize: 11 }}
                    >
                      {savedSkins.some((skin) => skin.dataUrl === skinPreview) ? 'Already saved' : 'Save to library'}
                    </button>
                  )}

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 9 }}>
                      Saved skins · {savedSkins.length}
                    </div>
                    {savedSkins.length === 0 ? (
                      <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>Choose a skin, then save it here for later.</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 58px)', justifyContent: 'start', gap: 8 }}>
                        {savedSkins.map((skin) => (
                          <div key={skin.id} style={{ position: 'relative' }}>
                            <button
                              onClick={() => chooseSavedSkin(skin)}
                              title={`${skin.name} · ${skin.variant === 'SLIM' ? 'Slim' : 'Classic'}`}
                              style={{ width: '100%', padding: '5px 4px', borderRadius: 8, border: selectedSavedId === skin.id ? '1px solid var(--accent-strong)' : '1px solid var(--border-soft)', background: selectedSavedId === skin.id ? 'rgba(var(--accent-rgb),0.1)' : 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                              <div style={{ margin: '0 auto' }}>
                                <SkinBody skinUrl={skin.dataUrl} variant={skin.variant} width={48} height={96} />
                              </div>
                            </button>
                            <button
                              onClick={() => void removeSavedSkin(skin.id)}
                              title="Remove saved skin"
                              style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 5, border: 'none', background: 'rgba(0,0,0,0.7)', color: '#ddd', cursor: 'pointer', fontSize: 11, lineHeight: '18px' }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cape selector — requires a valid Minecraft session */}
                {profile && (
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
                          selected={selectedCapeId === null}
                          onSelect={() => previewCape(null)}
                        />

                        {profile.capes.map((cape) => (
                          <CapeTile
                            key={cape.id}
                            cape={cape}
                            active={cape.state === 'ACTIVE'}
                            selected={selectedCapeId === cape.id}
                            onSelect={() => previewCape(cape.id)}
                          />
                        ))}
                      </div>

                      {previewDiffers ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                          <button
                            onClick={() => void equipPreviewedCape()}
                            disabled={capeLoading}
                            style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(var(--accent-rgb),0.14)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent-strong)', cursor: capeLoading ? 'default' : 'pointer', fontSize: 12, fontWeight: 600 }}
                          >
                            {capeLoading
                              ? 'Applying…'
                              : previewCapeId === null
                              ? 'Remove cape'
                              : 'Equip this cape'}
                          </button>
                          <button
                            onClick={() => setPreviewCapeId(undefined)}
                            disabled={capeLoading}
                            style={{ padding: '9px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-soft)', color: 'var(--text-muted)', cursor: capeLoading ? 'default' : 'pointer', fontSize: 12 }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 16, lineHeight: 1.5 }}>
                          Click a cape to preview it on your character, then{' '}
                          <strong style={{ color: 'var(--text-muted)' }}>Equip</strong> to apply it.
                          Equipped changes apply immediately in-game.
                        </p>
                      )}
                    </>
                  )}
                </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
