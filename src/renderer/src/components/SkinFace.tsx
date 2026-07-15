import { useEffect, useRef } from 'react'

interface Props {
  /** Skin texture as a data/URL — the flat 64×64 (or legacy 64×32) atlas. */
  skinUrl: string
  /** Rendered size in CSS pixels (the face is a square). */
  size?: number
}

// Front-facing head regions within a Minecraft skin atlas. The head lives in
// the top-left of every skin, identical for 64×64 and legacy 64×32 textures, so
// a single crop works for both. The hat/overlay layer is drawn on top of the
// base head so skins that rely on it (glasses, hair, etc.) look right.
const HEAD = { sx: 8, sy: 8, size: 8 }
const HAT = { sx: 40, sy: 8, size: 8 }

/**
 * Renders the character's face from a skin texture instead of showing the raw
 * unwrapped PNG. Cheap enough to use for a whole grid of thumbnails — it draws
 * two 8×8 crops to a pixelated canvas, with no WebGL/three.js involved.
 */
export default function SkinFace({ skinUrl, size = 40 }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const scale = size / HEAD.size
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // Keep the blocky look — no smoothing when scaling up the 8×8 crops.
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, HEAD.sx, HEAD.sy, HEAD.size, HEAD.size, 0, 0, HEAD.size * scale, HEAD.size * scale)
      ctx.drawImage(img, HAT.sx, HAT.sy, HAT.size, HAT.size, 0, 0, HAT.size * scale, HAT.size * scale)
    }
    img.src = skinUrl

    return () => { cancelled = true }
  }, [skinUrl, size])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
    />
  )
}
