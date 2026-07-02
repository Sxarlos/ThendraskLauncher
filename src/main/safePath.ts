import { resolve, sep } from 'path'

/**
 * Resolve a relative path (as found in pack manifests and zip entry names)
 * under a base directory, refusing anything that would escape it — '..'
 * segments, absolute paths, drive letters. Returns null when unsafe so
 * callers can skip the entry.
 */
export function safeJoin(baseDir: string, relPath: string): string | null {
  const base = resolve(baseDir)
  const dest = resolve(base, relPath)
  if (dest === base || !dest.startsWith(base + sep)) return null
  return dest
}
