import { useEffect, useRef } from 'react'
import { SkinViewer, WalkingAnimation } from 'skinview3d'

interface Props {
  uuid: string
  capeUrl?: string | null
  width?: number
  height?: number
}

export default function SkinViewer3D({ uuid, capeUrl, width = 240, height = 380 }: Props): JSX.Element {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const viewerRef  = useRef<SkinViewer | null>(null)
  const mountedRef = useRef(true)

  /* uuid format may be dashes or not — mc-heads accepts both */
  const skinUrl = `https://mc-heads.net/skin/${uuid}`

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

    /* Load skin + optional cape */
    void viewer.loadSkin(skinUrl)
    if (capeUrl) void viewer.loadCape(capeUrl)

    viewerRef.current = viewer

    return () => {
      mountedRef.current = false
      viewer.dispose()
      viewerRef.current = null
    }
  // Only recreate when uuid/dimensions change — cape is handled below
  }, [uuid, width, height, skinUrl])

  /* Update cape without tearing down the whole viewer */
  useEffect(() => {
    const v = viewerRef.current
    if (!v) return
    if (capeUrl) {
      void v.loadCape(capeUrl)
    } else {
      /* skinview3d accepts an empty string to clear the cape */
      void v.loadCape('')
    }
  }, [capeUrl])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', borderRadius: 8, background: 'transparent' }}
    />
  )
}
