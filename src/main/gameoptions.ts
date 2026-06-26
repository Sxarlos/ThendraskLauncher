import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DefaultGameSettings } from '@shared/types'

function versionAtLeast(mcVersion: string, reqMajor: number, reqMinor: number): boolean {
  const [maj, min] = mcVersion.split('.').map(Number)
  if ((maj ?? 0) !== reqMajor) return (maj ?? 0) > reqMajor
  return (min ?? 0) >= reqMinor
}

/**
 * Write a default options.txt into a fresh instance game directory.
 * No-ops if the file already exists or the MC version is below 1.12.
 */
export function writeDefaultOptions(
  gameDir: string,
  mcVersion: string,
  opts: DefaultGameSettings
): void {
  if (!versionAtLeast(mcVersion, 1, 12)) return

  const optionsFile = join(gameDir, 'options.txt')
  if (existsSync(optionsFile)) return // Never overwrite existing user settings

  const lines: string[] = []

  if (opts.renderDistance !== undefined) {
    lines.push(`renderDistance:${opts.renderDistance}`)
  }

  if (opts.graphics !== undefined) {
    const modeMap = { fancy: 0, fast: 1, fabulous: 2 }
    lines.push(`graphicsMode:${modeMap[opts.graphics]}`)
    lines.push(`fancyGraphics:${opts.graphics !== 'fast' ? 'true' : 'false'}`)
  }

  if (opts.particles !== undefined) {
    const particleMap = { all: 0, decreased: 1, minimal: 2 }
    lines.push(`particles:${particleMap[opts.particles]}`)
  }

  if (opts.fov !== undefined) {
    // Minecraft stores FOV as a float where 0.0 = 70°, range -1.0–1.0 = 30°–110°
    const normalized = (opts.fov - 70) / 40
    lines.push(`fov:${normalized.toFixed(6)}`)
  }

  if (lines.length > 0) {
    writeFileSync(optionsFile, lines.join('\n') + '\n', 'utf-8')
  }
}
