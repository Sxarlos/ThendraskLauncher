import { existsSync, readFileSync, writeFileSync } from 'fs'
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

/**
 * Apply curated control bindings into an instance's options.txt, merging with
 * whatever is already there. No-ops if `controls` is empty or the MC version
 * predates 1.13 (GLFW key names like `key.keyboard.w` only exist from 1.13+).
 *
 * Unlike writeDefaultOptions this DOES overwrite existing matching lines;
 * it's meant to be called on every launch so bindings stay in sync.
 */
export function applyControls(
  gameDir: string,
  mcVersion: string,
  controls: Record<string, string>
): void {
  const entries = Object.entries(controls)
  if (entries.length === 0) return
  if (!versionAtLeast(mcVersion, 1, 13)) return

  const managedLines: string[] = []
  for (const [action, value] of entries) {
    managedLines.push(`key_${action}:${value}`)
    // The swap-offhand action id was renamed across MC versions
    // (key.swapOffhand vs key.swapHands); write both so the binding sticks
    // regardless of which one the running version reads. Unknown option
    // keys are silently ignored by Minecraft, so the extra line is harmless.
    if (action === 'key.swapOffhand') {
      managedLines.push(`key_key.swapHands:${value}`)
    }
  }

  const managedByPrefix = new Map<string, string>()
  for (const line of managedLines) {
    managedByPrefix.set(line.slice(0, line.indexOf(':')), line)
  }

  const optionsFile = join(gameDir, 'options.txt')

  if (!existsSync(optionsFile)) {
    writeFileSync(optionsFile, managedLines.join('\n') + '\n', 'utf-8')
    return
  }

  const raw = readFileSync(optionsFile, 'utf-8')
  const lines = raw.split(/\r?\n/)
  // A trailing newline in the file produces a trailing empty element; drop
  // it so we don't introduce a spurious blank line on rewrite.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  const seen = new Set<string>()
  const merged = lines.map((line) => {
    const idx = line.indexOf(':')
    const prefix = idx === -1 ? line : line.slice(0, idx)
    const managed = managedByPrefix.get(prefix)
    if (managed === undefined) return line
    seen.add(prefix)
    return managed
  })

  for (const [prefix, line] of managedByPrefix) {
    if (!seen.has(prefix)) merged.push(line)
  }

  writeFileSync(optionsFile, merged.join('\n') + '\n', 'utf-8')
}
