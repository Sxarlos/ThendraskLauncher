import { useCallback, useEffect, useRef, useState } from 'react'
import type { Instance } from '@shared/types'
import { useApp, activeAccount } from '../store'
import { ipcError } from '../lib/ipcError'

/* ── Screenshot slideshow background ─────────────────────── */

// Duration of one panDrift cycle in ms — must match the CSS animation-duration.
const PAN_MS = 30_000

function HeroSlideshow({ urls }: { urls: string[] }): JSX.Element {
  const [current, setCurrent] = useState(0)
  const [prev, setPrev] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Wall-clock time when the current slide's panDrift started.
  const slideStartRef = useRef(Date.now())

  // Negative animation-delay to apply to the outgoing (prev) element so its
  // panDrift resumes at the exact point the current element was at when the
  // transition fired — eliminating the jump on slide change.
  const prevPanDelayRef = useRef('0s')

  const advance = useCallback(() => {
    if (urls.length <= 1) return
    // Capture how far into the pan cycle the outgoing slide was.
    const elapsed = (Date.now() - slideStartRef.current) % PAN_MS
    prevPanDelayRef.current = `${-(elapsed / 1000).toFixed(3)}s`
    // Reset timer for the incoming slide.
    slideStartRef.current = Date.now()
    setPrev(current)
    setCurrent((c) => (c + 1) % urls.length)
  }, [current, urls.length])

  useEffect(() => {
    if (urls.length <= 1) return
    timerRef.current = setInterval(advance, 7000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [advance, urls.length])

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center center',
    filter: 'brightness(0.65) saturate(1.2)',
  }

  const FADE = '1.5s ease both'

  return (
    <>
      {/* Current slide — rendered first so it sits beneath everything */}
      <img
        key={`cur-${current}`}
        src={urls[current]}
        style={{
          ...baseStyle,
          animation: `panDrift 30s ease-in-out infinite, imgFadeIn ${FADE}`,
        }}
        alt=""
        draggable={false}
      />
      {/* Previous slide — fades out on top; negative pan delay keeps it panning
          from exactly where the current element left off, eliminating any jump. */}
      {prev !== null && (
        <img
          key={`prev-${prev}`}
          src={urls[prev]}
          style={{
            ...baseStyle,
            animation: `panDrift 30s ease-in-out ${prevPanDelayRef.current} infinite, imgFadeOut ${FADE}`,
          }}
          onAnimationEnd={(e) => {
            if (e.animationName === 'imgFadeOut') setPrev(null)
          }}
          alt=""
          draggable={false}
        />
      )}
      {/* Dot indicators */}
      {urls.length > 1 && (
        <div
          className="absolute bottom-4 right-5 flex gap-1.5 z-10"
          style={{ pointerEvents: 'none' }}
        >
          {urls.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width: i === current ? 16 : 5,
                height: 5,
                background: i === current
                  ? 'rgba(var(--overlay-rgb), 0.85)'
                  : 'rgba(var(--overlay-rgb), 0.3)',
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}

function QuickCard({
  icon,
  title,
  desc,
  glowColor,
  hoverBorder,
  onClick,
}: {
  icon: JSX.Element
  title: string
  desc: string
  glowColor: string      // CSS colour for the atmosphere blur
  hoverBorder: string    // border colour on hover
  onClick: () => void
}): JSX.Element {
  const [hov, setHov] = useState(false)
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-250"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hov ? hoverBorder : 'var(--border-soft)'}`,
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? `0 16px 36px rgba(0,0,0,0.5), 0 0 0 1px ${hoverBorder}22` : '0 4px 12px rgba(0,0,0,0.3)',
      }}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Coloured atmosphere blur — same trick as Browse cards */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: glowColor,
          filter: 'blur(48px)',
          transform: 'scale(1.8)',
          opacity: hov ? 0.18 : 0.07,
        }}
      />
      {/* Subtle gradient to aid legibility */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(10,12,16,0.2) 0%, rgba(10,12,16,0.6) 100%)' }}
      />

      <div className="relative z-10 flex flex-col gap-2">
        <div>{icon}</div>
        <div>
          <div className="font-semibold text-[13px] text-white leading-snug">{title}</div>
          <div className="text-[12px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{desc}</div>
        </div>
      </div>
    </div>
  )
}

function MiniCard({ instance, onClick }: { instance: Instance; onClick: () => void }): JSX.Element {
  const prog    = useApp((s) => s.progress[instance.id])
  const running = prog?.state === 'running'

  return (
    <div
      className="flex items-center gap-3 rounded-xl p-3 transition-all duration-150 cursor-pointer"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.3)'
        e.currentTarget.style.background = 'var(--surface-2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-soft)'
        e.currentTarget.style.background = 'var(--surface)'
      }}
    >
      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--surface-2)' }}>
        {instance.iconUrl ? (
          <img src={instance.iconUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-base">🧱</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-white truncate leading-snug">{instance.name}</div>
        <div className="text-[11px] truncate" style={{ color: 'var(--text-dim)' }}>
          {instance.loader === 'vanilla' ? 'Vanilla' : instance.loader} · {instance.mcVersion}
        </div>
      </div>
      {running && (
        <div
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: 'var(--accent-strong)', boxShadow: '0 0 6px rgba(var(--accent-rgb),0.8)' }}
        />
      )}
    </div>
  )
}

export default function Home(): JSX.Element {
  const instances                = useApp((s) => s.instances)
  const accounts                 = useApp((s) => s.accounts)
  const progress                 = useApp((s) => s.progress)
  const setError                 = useApp((s) => s.setError)
  const setPage                  = useApp((s) => s.setPage)
  const refreshInstances         = useApp((s) => s.refreshInstances)
  const setPendingLibraryInstanceId = useApp((s) => s.setPendingLibraryInstanceId)

  const openInstance = (id: string): void => {
    setPendingLibraryInstanceId(id)
    setPage('library')
  }

  // Most recently played (or first) instance becomes the featured hero
  const featured =
    [...instances].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0] ?? null

  // Lazily fetch screenshots for the featured instance if not yet stored
  useEffect(() => {
    if (!featured) return
    if (featured.screenshotUrls?.length) return             // already fetched
    if (!featured.externalId || featured.source === 'manual') return  // no source to fetch from
    window.api.instances.fetchScreenshots(featured.id)
      .then((urls) => { if (urls?.length) void refreshInstances() })
      .catch(() => { /* silent — just won't have screenshots */ })
  }, [featured?.id])

  const signedIn = !!activeAccount(accounts)
  const prog     = featured ? progress[featured.id] : undefined
  const busy     = !!prog && ['preparing', 'downloading', 'launching'].includes(prog.state)
  const running  = prog?.state === 'running'
  const hasBg    = !!featured?.iconUrl
  const screenshots = featured?.screenshotUrls ?? []

  const play = async (): Promise<void> => {
    if (!featured) return
    setError(null)
    try {
      await window.api.launch.start(featured.id)
    } catch (e) {
      setError(ipcError(e))
    }
  }

  const playLabel = (): string => {
    if (running) return '● Running'
    if (prog?.state === 'downloading') return `${prog.percent ?? 0}%`
    if (busy) return 'Loading…'
    return '▶  Play'
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ animation: 'heroFadeIn 0.4s ease-out' }}>

      {/* ─── HERO PANEL ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden shrink-0" style={{ height: '56%', minHeight: 280 }}>

        {/* Background — screenshots → blurred icon → night sky */}
        {screenshots.length > 0 ? (
          <HeroSlideshow urls={screenshots} />
        ) : hasBg ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${featured!.iconUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(70px) brightness(0.55) saturate(1.4)',
              animation: 'panDrift 40s ease-in-out infinite',
            }}
          />
        ) : (
          /* Minecraft night-sky gradient fallback */
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(170deg, #04060e 0%, #060c1e 15%, #09142e 30%, #0d1e46 48%, #122858 62%, #1a3870 76%, #224898 88%, #2e5aaa 100%)',
            }}
          />
        )}

        {/* Star field — subtle shimmer in sky */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: [
              'radial-gradient(circle, rgba(var(--overlay-rgb),0.9) 1px, transparent 1px)',
              'radial-gradient(circle, rgba(var(--overlay-rgb),0.5) 1px, transparent 1px)',
              'radial-gradient(circle, rgba(var(--overlay-rgb),0.25) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '90px 90px, 150px 150px, 220px 220px',
            backgroundPosition: '12px 18px, 55px 70px, 100px 120px',
            opacity: hasBg ? 0.12 : 0.5,
            mixBlendMode: 'screen',
          }}
        />

        {/* Bottom vignette → merges into app bg */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 5,
            background:
              'linear-gradient(to bottom, rgba(10,12,16,0.1) 0%, rgba(10,12,16,0) 30%, rgba(10,12,16,0.55) 65%, var(--bg) 100%)',
          }}
        />

        {/* ── Hero content ── */}
        {featured ? (
          /* Existing instances: bottom-pinned info + play */
          <div className="absolute inset-x-0 bottom-0 px-6 pb-6 flex items-end gap-4" style={{ zIndex: 10 }}>
            {/* Pack icon — click to open detail panel */}
            <div
              className="shrink-0 rounded-2xl overflow-hidden cursor-pointer transition-transform duration-150 hover:scale-105"
              style={{
                width: 76,
                height: 76,
                boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
                border: '1px solid rgba(var(--overlay-rgb),0.1)',
              }}
              onClick={() => openInstance(featured.id)}
            >
              {featured.iconUrl ? (
                <img src={featured.iconUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-3xl"
                  style={{ background: 'var(--surface-2)' }}
                >
                  🧱
                </div>
              )}
            </div>

            {/* Name / meta — click to open detail panel */}
            <div
              className="flex-1 min-w-0 pb-1 cursor-pointer"
              onClick={() => openInstance(featured.id)}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1"
                style={{ color: 'var(--accent-strong)' }}
              >
                {featured.lastPlayed ? 'Last Played' : 'Ready to Play'}
              </div>
              <h1
                className="text-[26px] font-black leading-tight text-white truncate"
                style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9)' }}
              >
                {featured.name}
              </h1>
              <div className="text-sm mt-0.5" style={{ color: 'rgba(var(--overlay-rgb),0.4)' }}>
                <span className="capitalize">
                  {featured.loader === 'vanilla' ? 'Vanilla' : featured.loader}
                </span>
                <span className="mx-2" style={{ opacity: 0.35 }}>·</span>
                <span>Minecraft {featured.mcVersion}</span>
                {featured.source && featured.source !== 'manual' && (
                  <>
                    <span className="mx-2" style={{ opacity: 0.35 }}>·</span>
                    <span className="capitalize">{featured.source}</span>
                  </>
                )}
              </div>
            </div>

            {/* Play button */}
            <button
              onClick={play}
              disabled={!signedIn || busy}
              className="shrink-0 px-7 py-3 rounded-xl font-bold text-[15px] transition-all duration-200 disabled:opacity-50"
              style={
                running
                  ? {
                      background: 'transparent',
                      color: 'var(--accent)',
                      border: '1.5px solid rgba(var(--accent-rgb),0.4)',
                    }
                  : {
                      background: 'var(--accent-strong)',
                      color: '#000',
                      border: 'none',
                      boxShadow: '0 0 36px rgba(var(--accent-rgb),0.5), 0 4px 12px rgba(0,0,0,0.4)',
                    }
              }
              title={!signedIn ? 'Sign in with a Microsoft account first' : ''}
            >
              {playLabel()}
            </button>
          </div>
        ) : (
          /* No instances: centered welcome */
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <div
              className="text-[36px] font-black text-white mb-2 leading-tight"
              style={{ textShadow: '0 4px 32px rgba(0,0,0,0.9)' }}
            >
              Welcome to Ender Client
            </div>
            <div className="text-sm mb-7" style={{ color: 'rgba(var(--overlay-rgb),0.35)' }}>
              Your personal Minecraft launcher
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPage('library')}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-black"
                style={{ background: 'var(--accent-strong)', boxShadow: '0 0 28px rgba(var(--accent-rgb),0.45)' }}
              >
                Browse Modpacks
              </button>
              <button
                onClick={() => setPage('library')}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm"
                style={{ background: 'rgba(var(--overlay-rgb),0.09)', color: 'rgba(var(--overlay-rgb),0.75)', border: '1px solid rgba(var(--overlay-rgb),0.1)' }}
              >
                New Instance
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── LIBRARY STRIP ───────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-5">

        {/* Section header */}
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--border)' }}
          >
            Your Library
          </span>
          <button
            className="text-[11px] font-medium transition-colors"
            style={{ color: 'var(--border)' }}
            onClick={() => setPage('library')}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--border)')}
          >
            See all →
          </button>
        </div>

        {instances.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--surface-3)' }}>
            No instances yet — browse modpacks or create a vanilla instance.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {instances.slice(0, 7).map((i) => (
              <MiniCard key={i.id} instance={i} onClick={() => openInstance(i.id)} />
            ))}
            <button
              onClick={() => setPage('library')}
              className="h-[52px] rounded-xl flex items-center justify-center text-xs font-medium transition-all duration-150"
              style={{ background: 'transparent', border: '1px dashed var(--border-soft)', color: 'var(--border)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-faint)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-soft)'
                e.currentTarget.style.color = 'var(--border)'
              }}
            >
              + New instance
            </button>
          </div>
        )}

        {/* Quick-action cards — same bordered-cube style as Browse modpacks */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <QuickCard
            onClick={() => setPage('library')}
            glowColor="var(--accent-strong)"
            hoverBorder="rgba(var(--accent-rgb),0.35)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-strong)" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            }
            title="Browse Modpacks"
            desc="Find and install modpacks from Modrinth & CurseForge"
          />
          <QuickCard
            onClick={() => setPage('library')}
            glowColor="#6366f1"
            hoverBorder="rgba(99,102,241,0.35)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="7" height="18" rx="1.5"/>
                <rect x="11" y="3" width="11" height="11" rx="1.5"/>
                <rect x="11" y="16" width="11" height="5" rx="1.5"/>
              </svg>
            }
            title="My Library"
            desc="Manage your installed instances and vanilla builds"
          />
          <QuickCard
            onClick={() => setPage('servers')}
            glowColor="#3b82f6"
            hoverBorder="rgba(59,130,246,0.35)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="7" rx="2"/>
                <rect x="2" y="14" width="20" height="7" rx="2"/>
                <circle cx="6.5" cy="6.5" r="1" fill="#60a5fa" stroke="none"/>
                <circle cx="6.5" cy="17.5" r="1" fill="#60a5fa" stroke="none"/>
              </svg>
            }
            title="Servers"
            desc="Monitor and connect to your Minecraft servers"
          />
          <QuickCard
            onClick={() => setPage('settings')}
            glowColor="#f59e0b"
            hoverBorder="rgba(245,158,11,0.35)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            }
            title="Settings"
            desc="Configure Java path, memory allocation and game directory"
          />
        </div>
      </div>

    </div>
  )
}
