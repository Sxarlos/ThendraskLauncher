import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { net } from 'electron'
import type { Instance } from '@shared/types'
import { instanceGameDir, listInstances } from './instances'

const MODRINTH_API = 'https://api.modrinth.com/v2'
const PROJECT_SLUG = 'no-chat-restrictions'

interface ModrinthVersion {
  id: string
  files: { url: string; filename: string; primary: boolean }[]
  game_versions: string[]
  loaders: string[]
}

function isChatModFile(filename: string): boolean {
  const l = filename.toLowerCase()
  return (
    l.includes('nochatreport') ||
    l.includes('no-chat-report') ||
    l.includes('no-chat-restrict') ||
    l.includes('nochrestr') ||
    l.includes('nocr-') ||
    l.startsWith('ncr-') ||
    l.startsWith('ncr_')
  )
}

function modsDir(instanceId: string): string {
  const dir = join(instanceGameDir(instanceId), 'mods')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'EnderLauncher/0.1.8' } })
  if (!res.ok) throw new Error(`Modrinth API error: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'EnderLauncher/0.1.8' } })
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  writeFileSync(dest, Buffer.from(buf))
}

/** Ensure No Chat Reports is present for a single instance before launch. */
export async function ensureChatMod(instance: Instance): Promise<void> {
  if (instance.loader === 'vanilla') return

  const dir = modsDir(instance.id)

  // Already installed — skip download
  const existing = readdirSync(dir).find(isChatModFile)
  if (existing) return

  // Modrinth supports quilt under the fabric loader for this mod
  const loader = instance.loader === 'quilt' ? 'fabric' : instance.loader

  const versionsUrl =
    `${MODRINTH_API}/project/${PROJECT_SLUG}/version` +
    `?game_versions=${encodeURIComponent(JSON.stringify([instance.mcVersion]))}` +
    `&loaders=${encodeURIComponent(JSON.stringify([loader]))}`

  const versions = await fetchJson<ModrinthVersion[]>(versionsUrl)
  if (!versions.length) return // No compatible version — skip silently

  const latest = versions[0]
  const file = latest.files.find((f) => f.primary) ?? latest.files[0]
  if (!file) return

  await downloadToFile(file.url, join(dir, file.filename))
}

/** Remove any No Chat Reports jars from an instance's mods folder. */
export function removeChatMod(instanceId: string): void {
  const dir = join(instanceGameDir(instanceId), 'mods')
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir).filter(isChatModFile)) {
    unlinkSync(join(dir, f))
  }
}

/** Apply (or remove) the mod across all existing modded instances. */
export async function applyToAllInstances(enable: boolean): Promise<{ applied: number; skipped: number }> {
  const instances = listInstances().filter((i) => i.loader !== 'vanilla')
  let applied = 0
  let skipped = 0

  for (const inst of instances) {
    try {
      if (enable) {
        await ensureChatMod(inst)
      } else {
        removeChatMod(inst.id)
      }
      applied++
    } catch {
      skipped++
    }
  }

  return { applied, skipped }
}
