import { SkinViewer } from 'skinview3d'

// Renders full-body skin thumbnails without spinning up a live WebGL viewer per
// tile — browsers only allow a handful of simultaneous WebGL contexts, so a grid
// of live viewers would drop contexts once a user saves more than a few skins.
// Instead we keep ONE offscreen viewer, draw each skin into it, and capture a
// static PNG. Calls are serialized through a queue because the single viewer can
// only hold one skin at a time.

// Internal render resolution — higher than the on-screen tile so the downscaled
// thumbnail stays crisp. Aspect roughly matches a turned full-body player.
const RENDER_W = 120
const RENDER_H = 240

let viewer: SkinViewer | null = null
let queue: Promise<unknown> = Promise.resolve()

function getViewer(): SkinViewer {
  if (viewer && !viewer.disposed) return viewer
  const canvas = document.createElement('canvas')
  const v = new SkinViewer({
    canvas,
    width: RENDER_W,
    height: RENDER_H,
    // Required so toDataURL() reliably reads back the frame we just rendered.
    preserveDrawingBuffer: true,
    // We drive rendering manually via render(); no animation loop needed.
    renderPaused: true,
    // No mouse interaction on an offscreen capture surface.
    enableControls: false,
    // Framed so the whole body — head to feet — fits with a little margin.
    zoom: 0.95,
    pixelRatio: 1,
  })
  // Slight turn to the right of center-on so the thumbnail reads as 3D rather
  // than a flat front view.
  v.playerObject.rotation.y = -0.3
  viewer = v
  return v
}

/**
 * Render a full-body view of a skin texture and return it as a PNG data URL.
 * Serialized: concurrent callers wait their turn on the shared viewer.
 */
export function renderSkinBody(skinUrl: string, variant?: 'CLASSIC' | 'SLIM'): Promise<string> {
  const run = queue.then(async () => {
    const v = getViewer()
    await v.loadSkin(skinUrl, {
      model: variant === 'SLIM' ? 'slim' : variant === 'CLASSIC' ? 'default' : 'auto-detect',
    })
    v.render()
    return v.canvas.toDataURL('image/png')
  })
  // Keep the queue alive whether this render succeeded or failed.
  queue = run.catch(() => undefined)
  return run
}
