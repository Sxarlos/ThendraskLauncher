import type { MojangVersion } from '@shared/types'

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

// Manifest entries carry a `url` to each version's own JSON. That per-version
// JSON is what declares the required Java runtime; we keep the URL internally
// even though the renderer-facing MojangVersion type omits it.
interface RawVersion extends MojangVersion {
  url: string
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: RawVersion[]
}

let cache: { at: number; data: RawVersion[] } | null = null

async function getRawVersions(): Promise<RawVersion[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.data
  const res = await fetch(MANIFEST_URL)
  if (!res.ok) throw new Error(`Version manifest fetch failed: ${res.status}`)
  const json = (await res.json()) as Manifest
  cache = { at: Date.now(), data: json.versions }
  return json.versions
}

/** Fetch the list of Minecraft versions (cached for 10 minutes in-process). */
export async function getVersions(): Promise<MojangVersion[]> {
  return getRawVersions()
}

// Per-version required Java major is immutable, so cache it forever by version id.
const javaMajorCache = new Map<string, number>()

/**
 * The Java major version Mojang declares for a Minecraft version, read from that
 * version's own JSON (`javaVersion.majorVersion`). This is the authoritative
 * source. Newer Minecraft versions bump it (e.g. Java 25) and mods built for
 * them refuse older runtimes. Returns null when the version is unknown or the
 * field is absent (pre-1.17 versions omit it), so callers can fall back.
 */
export async function fetchRequiredJavaMajor(mcVersion: string): Promise<number | null> {
  const cached = javaMajorCache.get(mcVersion)
  if (cached !== undefined) return cached
  try {
    const entry = (await getRawVersions()).find((v) => v.id === mcVersion)
    if (!entry?.url) return null
    const res = await fetch(entry.url)
    if (!res.ok) return null
    const json = (await res.json()) as { javaVersion?: { majorVersion?: number } }
    const major = json.javaVersion?.majorVersion
    if (typeof major === 'number' && major > 0) {
      javaMajorCache.set(mcVersion, major)
      return major
    }
    return null
  } catch {
    return null
  }
}

export type { MojangVersion }
