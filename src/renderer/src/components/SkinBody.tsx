import { useEffect, useState } from 'react'
import { renderSkinBody } from '../skinRender'
import SkinFace from './SkinFace'

interface Props {
  /** Skin texture as a data/URL — the flat 64×64 (or legacy 64×32) atlas. */
  skinUrl: string
  variant?: 'CLASSIC' | 'SLIM'
  width?: number
  height?: number
}

// Rendered thumbnails are expensive to produce but never change, so cache the
// resulting data URL for the lifetime of the session (keyed by skin + variant).
const cache = new Map<string, string>()

/**
 * Full-body 3D-rendered thumbnail of a skin. Falls back to the flat head crop
 * ({@link SkinFace}) while rendering, or permanently if the render fails (e.g.
 * a lost WebGL context).
 */
export default function SkinBody({ skinUrl, variant, width = 44, height = 78 }: Props): JSX.Element {
  const key = `${variant ?? 'auto'}:${skinUrl}`
  const [src, setSrc] = useState<string | null>(() => cache.get(key) ?? null)

  useEffect(() => {
    const cached = cache.get(key)
    if (cached) { setSrc(cached); return }
    let cancelled = false
    setSrc(null)
    renderSkinBody(skinUrl, variant)
      .then((url) => {
        cache.set(key, url)
        if (!cancelled) setSrc(url)
      })
      // On failure we simply leave src null and fall back to the face below.
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [key, skinUrl, variant])

  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width, height, objectFit: 'contain', display: 'block', margin: '0 auto' }}
      />
    )
  }

  // Fallback: show the face while the body render is in flight or if it failed.
  return (
    <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <SkinFace skinUrl={skinUrl} size={Math.min(width, 40)} />
    </div>
  )
}
