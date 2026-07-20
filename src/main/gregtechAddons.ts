import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import type { GregTechCommunityAddon, Instance } from '@shared/types'
import { getInstance, instanceGameDir } from './instances'
import { createSnapshot, restoreSnapshot } from './snapshots'

const UA = 'Thendrask-Launcher (github.com/Sxarlos/ThendraskLauncher)'
const METADATA_FILE = '.thendrask-gregtech-addons.json'
const MAX_JAR_BYTES = 128 * 1024 * 1024

type AddonId = GregTechCommunityAddon['id']

interface InstalledAddon {
  id: AddonId
  version: string
  fileName: string
  repository: string
  installedAt: string
}

interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GitHubRelease {
  tag_name: string
  draft: boolean
  assets: GitHubAsset[]
}

interface AddonDefinition {
  id: AddonId
  title: string
  author: string
  category: GregTechCommunityAddon['category']
  description: string
  repository: string
  versionFor: (packVersion: string) => string | undefined
}

const DEFINITIONS: AddonDefinition[] = [
  {
    id: 'twist-space-technology',
    title: 'Twist Space Technology',
    author: 'Nxer and contributors',
    category: 'content expansion',
    description: 'A large unofficial GTNH expansion with new machines, multiblocks, recipes, and end-game progression.',
    repository: 'Nxer/Twist-Space-Technology-Mod',
    versionFor: (version) => ({
      '2.9.0': '0.8.0-beta1.1',
      '2.8.4': '0.7.16',
      '2.7.4': '0.6.23',
      '2.7.0': '0.6.7',
      '2.6.1': '0.5.11',
      '2.6.0': '0.4.30-GTNH2.6.0-final',
      '2.5.1': '0.4.30-GTNH2.5.1-final',
      '2.4.0': '0.3.7-TheLast2.4.0Fitted'
    })[version]
  },
  {
    id: 'gt-not-leisure',
    title: 'GT Not Leisure',
    author: 'ABKQPO and contributors',
    category: 'content expansion',
    description: 'A massive GTNH content overhaul with additional machines, recipes, materials, and late-game systems.',
    repository: 'ABKQPO/GT-Not-Leisure',
    versionFor: (version) => {
      if (version === '2.9.0') return '0.2.7-pre1'
      if (version === '2.8.4') return '0.2.6-hotfix1'
      if (/^2\.8\.[0-3]$/.test(version) || version === '2.8.0') return '0.2.2'
      if (/^2\.7\./.test(version)) return '0.1.9.1'
      return undefined
    }
  },
  {
    id: '123technology',
    title: '123Technology',
    author: 'CallmeSHaobe and contributors',
    category: 'content expansion',
    description: 'A substantial GTNH content addon featuring many additional machines, multiblocks, recipe pools, and intentionally powerful late-game options.',
    repository: 'CallmeSHaobe/123Technology',
    versionFor: (version) => version === '2.8.4' ? '2.1.8_5' : undefined
  },
  {
    id: 'nh-utilities',
    title: 'NH Utilities',
    author: 'Keriils, Tc_traveler, and contributors',
    category: 'automation & utility',
    description: 'Community quality-of-life content for GTNH, including wireless power options, utility items, Thaumcraft additions, and early-to-midgame helpers.',
    repository: 'Keriils/NH-Utilities',
    versionFor: (version) => {
      if (/^2\.9\./.test(version)) return '1.7.0'
      if (/^2\.8\./.test(version)) return '1.6.5'
      if (/^2\.7\./.test(version)) return '1.5.3'
      if (version === '2.6.1') return '1.3.5-fit261'
      return undefined
    }
  },
  {
    id: 'programmable-hatches',
    title: 'Programmable Hatches',
    author: 'reobf and contributors',
    category: 'automation & utility',
    description: 'Adds programmable input hatches, circuit providers, combined item/fluid inputs, and AE2-focused tools for cleaner multiblock automation.',
    repository: 'reobf/Programmable-Hatches-Mod',
    versionFor: (version) => {
      if (/^2\.9\./.test(version)) return 'v0.2.0p7-beta'
      if (/^2\.8\./.test(version)) return 'v0.1.3p55-beta'
      if (/^2\.7\./.test(version)) return 'v0.1.3p55-beta'
      return undefined
    }
  }
]

export function detectGTNHVersion(instance: Pick<Instance, 'name' | 'packVersionId'>): string | undefined {
  const candidates = [instance.packVersionId, instance.name]
  for (const candidate of candidates) {
    if (!candidate) continue
    const explicit = candidate.match(/(?:GTNH|GT New Horizons|New Horizons)[^0-9]*(2\.\d+(?:\.\d+)?(?:-(?:beta|rc)-?\d+)?)/i)
    if (explicit) return explicit[1]
    if (candidate === instance.packVersionId) {
      const direct = candidate.match(/^(2\.\d+(?:\.\d+)?(?:-(?:beta|rc)-?\d+)?)$/i)
      if (direct) return direct[1]
    }
  }
  return undefined
}

export function compatibleAddonVersion(addonId: AddonId, packVersion: string): string | undefined {
  const compatibilityVersion = packVersion.replace(/-(?:beta|rc)-?\d+$/i, '')
  return DEFINITIONS.find((definition) => definition.id === addonId)?.versionFor(compatibilityVersion)
}

function metadataPath(instanceId: string): string {
  return join(instanceGameDir(instanceId), METADATA_FILE)
}

function readMetadata(instanceId: string): InstalledAddon[] {
  try {
    const records = JSON.parse(readFileSync(metadataPath(instanceId), 'utf-8'))
    return Array.isArray(records) ? records as InstalledAddon[] : []
  } catch {
    return []
  }
}

function writeMetadata(instanceId: string, records: InstalledAddon[]): void {
  const path = metadataPath(instanceId)
  const temporary = `${path}.tmp`
  writeFileSync(temporary, JSON.stringify(records, null, 2), 'utf-8')
  renameSync(temporary, path)
}

function requireGTNH(instanceId: string): { instance: Instance; packVersion: string } {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('Instance not found.')
  if (instance.mcVersion !== '1.7.10' || !/gtnh|greg\s*tech|new horizons/i.test(instance.name)) {
    throw new Error('Community GTNH addons can only be installed into a detected GT New Horizons instance.')
  }
  const packVersion = detectGTNHVersion(instance)
  if (!packVersion) throw new Error('The GTNH pack version could not be detected. Include it in the instance name, for example "GTNH 2.8.4".')
  return { instance, packVersion }
}

export function listGregTechAddons(instanceId: string): GregTechCommunityAddon[] {
  const instance = getInstance(instanceId)
  const installed = instance ? readMetadata(instanceId) : []
  const packVersion = instance ? detectGTNHVersion(instance) : undefined
  const detected = !!instance && instance.mcVersion === '1.7.10' && /gtnh|greg\s*tech|new horizons/i.test(instance.name)

  return DEFINITIONS.map((definition) => {
    const compatibleVersion = packVersion ? compatibleAddonVersion(definition.id, packVersion) : undefined
    const record = installed.find((item) => item.id === definition.id)
    let compatibilityLabel = 'Select a detected GTNH instance'
    if (detected && !packVersion) compatibilityLabel = 'GTNH version not detected in instance name'
    else if (packVersion && !compatibleVersion) compatibilityLabel = `No verified build for GTNH ${packVersion}`
    else if (packVersion && compatibleVersion) compatibilityLabel = `Verified for GTNH ${packVersion}`
    return {
      id: definition.id,
      title: definition.title,
      author: definition.author,
      category: definition.category,
      description: definition.description,
      repositoryUrl: `https://github.com/${definition.repository}`,
      packVersion,
      compatibleVersion,
      compatibilityLabel,
      installable: detected && !!compatibleVersion && !record,
      installedVersion: record?.version
    }
  })
}

async function githubRelease(repository: string, tag: string): Promise<GitHubRelease> {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA }
  })
  if (!response.ok) throw new Error(`GitHub could not find the verified ${tag} release (HTTP ${response.status}).`)
  return response.json() as Promise<GitHubRelease>
}

function selectReleaseJar(release: GitHubRelease): GitHubAsset {
  const candidates = release.assets.filter((asset) => {
    const name = asset.name.toLowerCase()
    return name.endsWith('.jar') && !/(?:^|[-_.])(dev|sources?|javadoc|api|predowngrade)(?:[-_.]|$)/i.test(name)
  })
  if (candidates.length !== 1) throw new Error('The verified GitHub release does not contain exactly one distributable mod JAR.')
  const asset = candidates[0]
  if (asset.size <= 0 || asset.size > MAX_JAR_BYTES) throw new Error('The release JAR has an unexpected size.')
  return asset
}

export async function installGregTechAddon(instanceId: string, addonId: AddonId): Promise<GregTechCommunityAddon[]> {
  const { packVersion } = requireGTNH(instanceId)
  const definition = DEFINITIONS.find((item) => item.id === addonId)
  if (!definition) throw new Error('Unknown GregTech community addon.')
  const version = compatibleAddonVersion(addonId, packVersion)
  if (!version) throw new Error(`${definition.title} has no verified build for GTNH ${packVersion}.`)
  if (readMetadata(instanceId).some((item) => item.id === addonId)) return listGregTechAddons(instanceId)

  const release = await githubRelease(definition.repository, version)
  if (release.draft || release.tag_name !== version) throw new Error('GitHub returned an unexpected release.')
  const asset = selectReleaseJar(release)
  if (basename(asset.name) !== asset.name) throw new Error('The release contains an unsafe file name.')

  const modsDir = join(instanceGameDir(instanceId), 'mods')
  mkdirSync(modsDir, { recursive: true })
  const destination = join(modsDir, asset.name)
  if (existsSync(destination)) throw new Error(`${asset.name} already exists in this instance. Remove or disable it before using the managed installer.`)

  const snapshot = createSnapshot(instanceId, 'manual', `Before installing ${definition.title}`)
  try {
    const response = await fetch(asset.browser_download_url, { headers: { 'User-Agent': UA } })
    if (!response.ok) throw new Error(`GitHub download failed (HTTP ${response.status}).`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length !== asset.size || bytes.length > MAX_JAR_BYTES) throw new Error('The downloaded JAR size did not match the GitHub release metadata.')
    const temporary = `${destination}.download`
    writeFileSync(temporary, bytes)
    renameSync(temporary, destination)
    const records = readMetadata(instanceId)
    records.push({ id: addonId, version, fileName: asset.name, repository: definition.repository, installedAt: new Date().toISOString() })
    writeMetadata(instanceId, records)
  } catch (error) {
    restoreSnapshot(instanceId, snapshot.id)
    throw error
  }
  return listGregTechAddons(instanceId)
}
