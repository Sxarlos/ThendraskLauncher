import type { MojangVersion } from '@shared/types'

const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: MojangVersion[]
}

let cache: { at: number; data: MojangVersion[] } | null = null

/** Fetch the list of Minecraft versions (cached for 10 minutes in-process). */
export async function getVersions(): Promise<MojangVersion[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.data
  const res = await fetch(MANIFEST_URL)
  if (!res.ok) throw new Error(`Version manifest fetch failed: ${res.status}`)
  const json = (await res.json()) as Manifest
  cache = { at: Date.now(), data: json.versions }
  return json.versions
}

export type { MojangVersion }
