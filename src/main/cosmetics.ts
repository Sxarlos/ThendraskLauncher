/**
 * Ender Client cosmetics injection.
 *
 * Copies the appropriate bundled cosmetics jar into the instance's mods/ folder
 * before launch. Controlled by the hidden `cosmeticsEnabled` setting — off by
 * default, not exposed in the UI.
 *
 * To enable (DevTools console):
 *   window.api.settings.set({ cosmeticsEnabled: true })
 *
 * Currently supported:
 *   NeoForge 1.21.1 → endercosmetics-1.0.0.jar
 */

import { app } from 'electron'
import { existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { instanceGameDir } from './instances'
import type { LoaderType } from '@shared/types'

interface CosmeticsEntry {
  loader: LoaderType
  mcVersion: string
  jarName: string     // filename inside resources/
  destName: string    // filename written to mods/
}

const COSMETICS_JARS: CosmeticsEntry[] = [
  {
    loader: 'neoforge',
    mcVersion: '1.21.1',
    jarName: 'endercosmetics-1.0.0.jar',
    destName: 'ender-cosmetics-neoforge-1.21.1.jar',
  },
]

function resourcePath(filename: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, filename)
    : join(__dirname, '../../resources', filename)
}

/** Remove any previously injected cosmetics jars so stale versions don't stack up. */
function removeStaleJars(modsDir: string, keepName: string): void {
  try {
    for (const f of readdirSync(modsDir)) {
      if (f.startsWith('ender-cosmetics-') && f.endsWith('.jar') && f !== keepName) {
        unlinkSync(join(modsDir, f))
      }
    }
  } catch { /* non-fatal */ }
}

export function injectCosmetics(instanceId: string, loader: LoaderType, mcVersion: string): void {
  const entry = COSMETICS_JARS.find(
    (e) => e.loader === loader && e.mcVersion === mcVersion
  )
  if (!entry) return   // no jar for this loader+version yet — silent skip

  const src = resourcePath(entry.jarName)
  if (!existsSync(src)) {
    console.warn(`[Cosmetics] Bundled jar not found: ${src}`)
    return
  }

  const gameDir = instanceGameDir(instanceId)
  const modsDir = join(gameDir, 'mods')
  if (!existsSync(modsDir)) mkdirSync(modsDir, { recursive: true })

  removeStaleJars(modsDir, entry.destName)

  const dest = join(modsDir, entry.destName)
  if (existsSync(dest)) return   // already injected

  copyFileSync(src, dest)
  console.log(`[Cosmetics] Injected ${entry.destName}`)
}
