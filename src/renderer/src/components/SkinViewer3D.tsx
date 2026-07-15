import { useEffect, useRef } from 'react'
import { SkinViewer, WalkingAnimation } from 'skinview3d'

interface Props {
  uuid: string
  skinUrl?: string | null
  variant?: 'CLASSIC' | 'SLIM'
  capeUrl?: string | null
  width?: number
  height?: number
}

export default function SkinViewer3D({ uuid, skinUrl: suppliedSkinUrl, variant, capeUrl, width = 240, height = 380 }: Props): JSX.Element {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const viewerRef  = useRef<SkinViewer | null>(null)
  const mountedRef = useRef(true)

  /* uuid format may be dashes or not - mc-heads accepts both */
  const skinUrl = (suppliedSkinUrl || `https://mc-heads.net/skin/${uuid}`).replace(/^http:\/\//, 'https://')
  const safeCapeUrl = capeUrl?.replace(/^http:\/\//, 'https://') ?? null

  /* Create the viewer once. Skin and cape are loaded by the effects below so
     that changing either one updates the same viewer instead of tearing it
     down — recreating the viewer on every skin change used to drop the cape. */
  useEffect(() => {
    mountedRef.current = true
    if (!canvasRef.current) return

    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width,
      height,
      /* transparent background so we can control it via CSS */
      background: undefined as unknown as string,
    })

    /* Zoom the camera in a little closer than the default */
    viewer.camera.position.set(0, 15, 45)
    viewer.camera.lookAt(0, 15, 0)

    /* Walking animation */
    const anim = new WalkingAnimation()
    anim.speed = 0.45
    viewer.animation = anim

    /* Slow auto-rotate */
    viewer.autoRotate = true
    viewer.autoRotateSpeed = 0.3

    viewerRef.current = viewer

    return () => {
      mountedRef.current = false
      viewer.dispose()
      viewerRef.current = null
    }
  }, [width, height])

  /* Load / update the skin on the existing viewer. */
  useEffect(() => {
    const v = viewerRef.current
    if (!v) return
    void v.loadSkin(skinUrl, { model: variant === 'SLIM' ? 'slim' : variant === 'CLASSIC' ? 'default' : 'auto-detect' })
  }, [skinUrl, variant])

  /* Load, update, or clear the cape on the existing viewer. Passing null (not
     an empty string) is how skinview3d removes the cape. */
  useEffect(() => {
    const v = viewerRef.current
    if (!v) return
    if (safeCapeUrl) {
      void v.loadCape(safeCapeUrl)
    } else {
      v.loadCape(null)
    }
  }, [safeCapeUrl])

  /* Pause WebGL animation loop when the window is minimised */
  useEffect(() => {
    const pause = (): void => {
      const v = viewerRef.current
      if (!v) return
      v.animation = null
      v.autoRotate = false
    }
    const resume = (): void => {
      const v = viewerRef.current
      if (!v) return
      const anim = new WalkingAnimation()
      anim.speed = 0.45
      v.animation = anim
      v.autoRotate = true
      v.autoRotateSpeed = 0.3
    }
    const unsubIdle = window.api.window.onIdle(pause)
    const unsubActive = window.api.window.onActive(resume)
    return () => { unsubIdle(); unsubActive() }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', borderRadius: 8, background: 'transparent' }}
    />
  )
}
