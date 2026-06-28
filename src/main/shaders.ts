import { net } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const MR_BASE = 'https://api.modrinth.com/v2'
const UA = 'EnderClient/0.1.8'

async function mrGet(path: string): Promise<unknown> {
  const res = await net.fetch(MR_BASE + path, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Modrinth ${res.status}`)
  return res.json()
}

/**
 * Searches Modrinth for the named shader at the given version and downloads
 * the zip into the shaderpacks directory. Returns the destination path on
 * success, or null if the shader/version couldn't be found.
 */
export async function autoInstallShader(
  shaderName: string,
  version: string,
  shaderpacks: string
): Promise<string | null> {
  const results = await mrGet(
    `/search?query=${encodeURIComponent(shaderName)}&facets=${encodeURIComponent('[["project_type:shader"]]')}&limit=5`
  ) as any

  const project = results.hits?.[0]
  if (!project) return null

  const versions = await mrGet(`/project/${project.project_id}/version`) as any[]

  // Try exact match first, then strip leading 'r', then substring
  const match = versions.find((v: any) =>
    v.version_number === version ||
    v.version_number === version.replace(/^r/i, '') ||
    (v.name as string | undefined)?.toLowerCase().includes(version.toLowerCase())
  )
  if (!match) return null

  const file = (match.files as any[])?.find((f: any) => f.primary) ?? match.files?.[0]
  if (!file?.url || !file?.filename) return null

  mkdirSync(shaderpacks, { recursive: true })
  const dest = join(shaderpacks, file.filename as string)

  const res = await net.fetch(file.url as string, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)

  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}
