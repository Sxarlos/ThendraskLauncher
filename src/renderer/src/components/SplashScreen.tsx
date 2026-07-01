import { useCallback, useEffect, useRef, useState } from 'react'
import eyeIcon from '../assets/logo.png'

type Phase = 'appear' | 'float' | 'pop' | 'done'

/* Burst particles: 16 shards flying outward like the in-game pop */
const PARTICLES: { px: number; py: number; color: string; size: number; delay: number }[] = [
  { px:   0, py: -96, color: 'var(--accent-strong)', size: 9, delay:  0 },
  { px:  68, py: -68, color: '#a855f7', size: 6, delay: 20 },
  { px:  96, py:   0, color: '#00e5a0', size: 8, delay:  8 },
  { px:  68, py:  68, color: 'var(--accent-strong)', size: 5, delay: 35 },
  { px:   0, py:  96, color: '#7c3aed', size: 9, delay:  0 },
  { px: -68, py:  68, color: 'var(--accent)', size: 6, delay: 20 },
  { px: -96, py:   0, color: 'var(--accent-strong)', size: 8, delay:  8 },
  { px: -68, py: -68, color: '#a855f7', size: 5, delay: 35 },
  { px:  38, py: -86, color: 'var(--accent)', size: 5, delay: 14 },
  { px:  86, py: -38, color: '#7c3aed', size: 4, delay: 28 },
  { px:  86, py:  38, color: 'var(--accent-strong)', size: 5, delay:  4 },
  { px:  38, py:  86, color: '#00e5a0', size: 4, delay: 22 },
  { px: -38, py: -86, color: '#a855f7', size: 4, delay: 38 },
  { px: -86, py: -38, color: 'var(--accent)', size: 5, delay: 16 },
  { px: -86, py:  38, color: 'var(--accent-strong)', size: 4, delay: 30 },
  { px: -38, py:  86, color: '#7c3aed', size: 4, delay:  6 },
]

/* A handful of ambient ender particles drifting in the background */
const AMBIENT: { x: number; y: number; size: number; color: string; dur: number; delay: number }[] = [
  { x: 12,  y: 20, size: 3, color: 'var(--accent-strong)', dur: 4.2, delay: 0   },
  { x: 82,  y: 15, size: 2, color: '#7c3aed', dur: 5.1, delay: 0.8 },
  { x: 25,  y: 75, size: 3, color: 'var(--accent)', dur: 3.8, delay: 1.6 },
  { x: 72,  y: 68, size: 2, color: '#a855f7', dur: 4.6, delay: 0.4 },
  { x: 50,  y: 88, size: 2, color: 'var(--accent-strong)', dur: 5.3, delay: 2.1 },
  { x: 90,  y: 45, size: 3, color: '#00e5a0', dur: 3.5, delay: 1.0 },
  { x:  8,  y: 55, size: 2, color: '#7c3aed', dur: 4.9, delay: 1.8 },
  { x: 60,  y: 10, size: 2, color: 'var(--accent)', dur: 4.0, delay: 0.6 },
]

interface Props {
  /** Set to true once accounts + instances have finished loading */
  appReady: boolean
}

export default function SplashScreen({ appReady }: Props): JSX.Element | null {
  const [phase, setPhase]   = useState<Phase>('appear')
  const canPop              = useRef(false)
  const appReadyRef         = useRef(false)
  appReadyRef.current       = appReady

  const triggerPop = useCallback(() => {
    setPhase((prev) => (prev === 'float' ? 'pop' : prev))
  }, [])

  /* appear → float after appear animation completes */
  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => (p === 'appear' ? 'float' : p)), 650)
    return () => clearTimeout(t)
  }, [])

  /* minimum display time before the pop is allowed */
  useEffect(() => {
    const t = setTimeout(() => {
      canPop.current = true
      if (appReadyRef.current) triggerPop()
    }, 1700)
    return () => clearTimeout(t)
  }, [triggerPop])

  /* react to appReady arriving (if min time already passed) */
  useEffect(() => {
    if (appReady && canPop.current) triggerPop()
  }, [appReady, triggerPop])

  /* pop → done after the pop + fade animation */
  useEffect(() => {
    if (phase !== 'pop') return
    const t = setTimeout(() => setPhase('done'), 950)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'done') return null

  const isPopping = phase === 'pop'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center select-none"
      style={{
        background: '#06080f',
        opacity: isPopping ? 0 : 1,
        transition: isPopping ? 'opacity 0.55s ease 0.32s' : undefined,
        pointerEvents: isPopping ? 'none' : 'auto',
      }}
    >
      {/* Ambient background particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {AMBIENT.map((a, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${a.x}%`,
              top: `${a.y}%`,
              width: a.size,
              height: a.size,
              background: a.color,
              boxShadow: `0 0 ${a.size * 3}px ${a.color}`,
              animation: `ambientFloat ${a.dur}s ease-in-out ${a.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Eye container - fixed size so particles have a stable origin */}
      <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>

        {/* Pulsing glow ring behind the eye */}
        <div
          className="absolute rounded-full"
          style={{
            width: 140,
            height: 140,
            background: 'radial-gradient(circle, rgba(var(--accent-rgb),0.18) 0%, transparent 70%)',
            animation: 'eyeGlowPulse 2.4s ease-in-out infinite',
          }}
        />

        {/* The Eye itself */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            animation:
              phase === 'appear'
                ? 'eyeAppear 0.65s cubic-bezier(0.175,0.885,0.32,1.275) forwards'
                : phase === 'float'
                ? 'eyeFloat 2.3s ease-in-out infinite'
                : 'eyePop 0.38s ease-out forwards',
          }}
        >
          <img
            src={eyeIcon}
            width={112}
            height={112}
            style={{
              display: 'block',
              filter: 'drop-shadow(0 0 10px rgba(var(--accent-rgb),0.35))',
            }}
            alt=""
          />
        </div>

        {/* Expansion ring on pop */}
        {isPopping && (
          <>
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 80, height: 80,
                border: '2px solid var(--accent-strong)',
                animation: 'splashRing 0.55s ease-out forwards',
              }}
            />
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 80, height: 80,
                border: '2px solid #7c3aed',
                animation: 'splashRing 0.55s ease-out 80ms forwards',
              }}
            />
          </>
        )}

        {/* Burst particles - rendered from the centre of the container */}
        {isPopping && PARTICLES.map((p, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{
              width: p.size,
              height: p.size,
              borderRadius: 2,
              background: p.color,
              boxShadow: `0 0 ${p.size + 3}px ${p.color}`,
              top: '50%',
              left: '50%',
              marginTop: -p.size / 2,
              marginLeft: -p.size / 2,
              animation: `particleFly 0.65s cubic-bezier(0,0,0.2,1) ${p.delay}ms forwards`,
              ['--px' as string]: `${p.px}px`,
              ['--py' as string]: `${p.py}px`,
            }}
          />
        ))}
      </div>

      {/* Title - visible only during float */}
      <div
        style={{
          marginTop: 24,
          textAlign: 'center',
          opacity: phase === 'float' ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.25em',
            color: 'var(--accent-strong)',
            textTransform: 'uppercase',
          }}
        >
          Thendrask Launcher
        </div>
        <div style={{ fontSize: 11, marginTop: 5, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
          Loading…
        </div>
      </div>
    </div>
  )
}
