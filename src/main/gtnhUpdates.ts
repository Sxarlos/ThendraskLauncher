import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, lstatSync, mkdirSync } from 'fs'
import { cp, lstat, mkdir, open, readdir, rm, statfs } from 'fs/promises'
import { dirname, join } from 'path'
import type { GTNHSpecialBuild, GTNHUpdateInfo, GTNHUpdateProgress, Instance } from '@shared/types'
import { createInstance, getInstance, instanceGameDir, instanceRootDir, removeInstance, updateInstance } from './instances'
import { importLocalPack } from './modpack'
import { detectGTNHVersion } from './gregtechAddons'

const VERSION_HISTORY_URL = 'https://www.gtnewhorizons.com/version-history/'
const DOWNLOAD_ROOT = 'https://downloads.gtnewhorizons.com/Multi_mc_downloads'
const UA = 'Thendrask-Launcher (github.com/Sxarlos/ThendraskLauncher)'
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024

interface StableRelease {
  version: string
  fileName: string
  url: string
  changelogUrl?: string
}

interface SpecialRelease {
  id: string
  title: string
  date: string
  description: string
  fileName: string
  url: string
}

const PRESERVED_DIRECTORIES = [
  'saves',
  'journeymap',
  'visualprospecting',
  'TCNodeTracker',
  'schematics',
  'resourcepacks',
  'shaderpacks',
  'screenshots'
]

const PRESERVED_FILES = [
  'localconfig.cfg',
  'BotaniaVars.dat',
  'options.txt',
  'optionsnf.txt',
  'optionsof.txt',
  'servers.dat',
  'config/shaders.properties',
  'config/vendingmachine/favourites'
]

function parsedVersion(version: string): { parts: number[]; stage: number; sequence: number } {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(beta|rc)-?(\d+))?$/i)
  if (!match) return { parts: [0, 0, 0], stage: 0, sequence: 0 }
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    stage: !match[4] ? 3 : match[4].toLowerCase() === 'rc' ? 2 : 1,
    sequence: Number(match[5] ?? 0)
  }
}

export function compareGTNHVersions(left: string, right: string): number {
  const a = parsedVersion(left)
  const b = parsedVersion(right)
  for (let index = 0; index < 3; index++) {
    const difference = a.parts[index] - b.parts[index]
    if (difference !== 0) return difference
  }
  if (a.stage !== b.stage) return a.stage - b.stage
  return a.sequence - b.sequence
}

export function parseStableGTNHReleases(html: string): StableRelease[] {
  const matches = html.matchAll(/GT_New_Horizons_(\d+\.\d+\.\d+)_Java_(17-\d+)\.zip/g)
  const byVersion = new Map<string, StableRelease>()
  for (const match of matches) {
    const version = match[1]
    const fileName = match[0]
    byVersion.set(version, { version, fileName, url: findArchiveUrl(html, fileName), changelogUrl: findChangelogUrl(html, version) })
  }
  return [...byVersion.values()].sort((a, b) => compareGTNHVersions(b.version, a.version))
}

export function parseBetaGTNHReleases(html: string): StableRelease[] {
  const matches = html.matchAll(/GT_New_Horizons_(\d+\.\d+\.\d+-(?:beta|rc)-?\d+)_Java_(17-\d+)\.zip/gi)
  const byVersion = new Map<string, StableRelease>()
  for (const match of matches) {
    const version = match[1].toLowerCase()
    const fileName = match[0]
    byVersion.set(version, { version, fileName, url: findArchiveUrl(html, fileName), changelogUrl: findChangelogUrl(html, version) })
  }
  return [...byVersion.values()].sort((a, b) => compareGTNHVersions(b.version, a.version))
}

function releaseBlock(html: string, title: string): string | undefined {
  const marker = `>${title}</span>`
  const index = html.toLowerCase().indexOf(marker.toLowerCase())
  if (index < 0) return undefined
  const start = html.lastIndexOf('<details', index)
  const end = html.indexOf('</details>', index)
  return start >= 0 && end > start ? html.slice(start, end + '</details>'.length) : undefined
}

function findChangelogUrl(html: string, version: string): string | undefined {
  const block = releaseBlock(html, version)
  return block?.match(/href="([^"]+)"[^>]*>Click here to get the changelog/i)?.[1]
}

function findArchiveUrl(html: string, fileName: string): string {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.match(new RegExp(`href="([^"]*${escaped})"`, 'i'))?.[1] ?? `${DOWNLOAD_ROOT}/${fileName}`
}

export function parseSpecialGTNHReleases(html: string): SpecialRelease[] {
  const blocks = html.match(/<details[\s\S]*?<\/details>/gi) ?? []
  return blocks.flatMap((block) => {
    const title = block.match(/font-semibold">([^<]+)<\/span>/i)?.[1]?.trim()
    const asset = block.match(/href="([^"]*GT_New_Horizons_([^"/]*?(?:April|Fool)[^"/]*)_Java_17-\d+\.zip)"/i)
    if (!title || !asset) return []
    const date = block.match(/data-icon="mdi:calendar"[\s\S]*?<span>(\d{4}\/\d{2}\/\d{2})<\/span>/i)?.[1] ?? ''
    const descriptionHtml = block.match(/<p class="mb-4 text-gray-300">([\s\S]*?)<\/p>/i)?.[1] ?? ''
    const description = descriptionHtml.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
    const fileName = asset[1].split('/').pop()!
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return [{ id, title, date, description, fileName, url: asset[1] }]
  })
}

export function selectGTNHUpdateRelease(releases: StableRelease[], currentVersion: string): StableRelease {
  if (!releases.length) throw new Error('No stable GTNH releases are available.')
  const current = parsedVersion(currentVersion).parts
  const newest = releases[0]
  const newestParts = parsedVersion(newest.version).parts
  if (newestParts[0] === current[0] && newestParts[1] > (current[1] ?? 0) + 1) {
    const nextMinor = releases.find((release) => {
      const parts = parsedVersion(release.version).parts
      return parts[0] === current[0] && parts[1] === (current[1] ?? 0) + 1
    })
    if (nextMinor) return nextMinor
  }
  return newest
}

function requireGTNH(instanceId: string): { instance: Instance; currentVersion: string } {
  const instance = getInstance(instanceId)
  if (!instance) throw new Error('Instance not found.')
  if (instance.packVersionId?.startsWith('special:')) {
    throw new Error('Special GTNH builds are isolated challenge instances and cannot be used as an update source.')
  }
  if (instance.mcVersion !== '1.7.10' || !/gtnh|gt new horizons|new horizons/i.test(instance.name)) {
    throw new Error('Pack updates are only available for a detected GT New Horizons instance.')
  }
  const currentVersion = detectGTNHVersion(instance)
  if (!currentVersion) throw new Error('The GTNH version could not be detected from this instance.')
  return { instance, currentVersion }
}

async function pathSize(path: string): Promise<number> {
  if (!existsSync(path)) return 0
  const info = await lstat(path)
  if (info.isSymbolicLink()) return 0
  if (!info.isDirectory()) return info.size
  const entries = await readdir(path)
  const sizes = await Promise.all(entries.map((entry) => pathSize(join(path, entry))))
  return sizes.reduce((total, size) => total + size, 0)
}

async function preservedDataSize(instanceId: string): Promise<number> {
  const game = instanceGameDir(instanceId)
  const paths = [...PRESERVED_DIRECTORIES, ...PRESERVED_FILES]
  const sizes = await Promise.all(paths.map((relative) => pathSize(join(game, relative))))
  return sizes.reduce((total, size) => total + size, 0)
}

async function diskEstimate(
  instanceId: string,
  archiveBytes: number,
  migratePersonalData: boolean
): Promise<{ requiredBytes: number; freeBytes: number; diskSpaceSufficient: boolean }> {
  const personalBytes = migratePersonalData ? await preservedDataSize(instanceId) : 0
  const requiredBytes = archiveBytes * 2 + personalBytes + 512 * 1024 * 1024
  const instanceFs = await statfs(instanceRootDir(instanceId))
  const freeBytes = instanceFs.bavail * instanceFs.bsize
  const tempFs = await statfs(app.getPath('temp'))
  const tempFreeBytes = tempFs.bavail * tempFs.bsize
  return {
    requiredBytes,
    freeBytes,
    diskSpaceSufficient: freeBytes >= requiredBytes && tempFreeBytes >= archiveBytes + 128 * 1024 * 1024
  }
}

async function archiveSize(url: string): Promise<number | undefined> {
  try {
    const head = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } })
    const length = Number.parseInt(head.headers.get('content-length') ?? '', 10)
    return head.ok && Number.isFinite(length) && length > 0 ? length : undefined
  } catch {
    return undefined
  }
}

async function releasesForChannel(channel: GTNHUpdateInfo['channel']): Promise<StableRelease[]> {
  const response = await fetch(VERSION_HISTORY_URL, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`The official GTNH version history returned HTTP ${response.status}.`)
  const html = await response.text()
  const releases = channel === 'beta' ? parseBetaGTNHReleases(html) : parseStableGTNHReleases(html)
  if (!releases.length) throw new Error(`No ${channel} GTNH Prism releases were found on the official version-history page.`)
  return releases
}

export async function checkGTNHUpdate(instanceId: string, channel: GTNHUpdateInfo['channel'] = 'stable'): Promise<GTNHUpdateInfo> {
  const { currentVersion } = requireGTNH(instanceId)
  const latest = selectGTNHUpdateRelease(await releasesForChannel(channel), currentVersion)
  let downloadBytes: number | undefined
  let estimate: Awaited<ReturnType<typeof diskEstimate>> | undefined
  if (compareGTNHVersions(latest.version, currentVersion) > 0) {
    downloadBytes = await archiveSize(latest.url)
    if (downloadBytes) estimate = await diskEstimate(instanceId, downloadBytes, true)
  }
  return {
    channel,
    currentVersion,
    latestVersion: latest.version,
    available: compareGTNHVersions(latest.version, currentVersion) > 0,
    downloadBytes,
    ...estimate,
    releasePageUrl: VERSION_HISTORY_URL,
    changelogUrl: latest.changelogUrl
  }
}

export async function listGTNHSpecialBuilds(instanceId: string): Promise<GTNHSpecialBuild[]> {
  requireGTNH(instanceId)
  const response = await fetch(VERSION_HISTORY_URL, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`The official GTNH version history returned HTTP ${response.status}.`)
  const releases = parseSpecialGTNHReleases(await response.text())
  return Promise.all(releases.map(async (release) => {
    const downloadBytes = await archiveSize(release.url)
    const estimate = downloadBytes ? await diskEstimate(instanceId, downloadBytes, false) : undefined
    return {
      id: release.id,
      title: release.title,
      date: release.date,
      description: release.description,
      downloadBytes,
      ...estimate
    }
  }))
}

async function ensureDiskSpace(instanceId: string, url: string, migratePersonalData: boolean): Promise<number> {
  const bytes = await archiveSize(url)
  if (!bytes) throw new Error('The official archive size could not be verified.')
  const estimate = await diskEstimate(instanceId, bytes, migratePersonalData)
  if (!estimate.diskSpaceSufficient) {
    const requiredGb = (estimate.requiredBytes / (1024 ** 3)).toFixed(1)
    const freeGb = (estimate.freeBytes / (1024 ** 3)).toFixed(1)
    throw new Error(`Not enough free disk space. This install needs about ${requiredGb} GB; ${freeGb} GB is available.`)
  }
  return bytes
}

async function downloadRelease(
  release: StableRelease,
  outputPath: string,
  report: (progress: GTNHUpdateProgress) => void,
  instanceId: string
): Promise<void> {
  const response = await fetch(release.url, { headers: { 'User-Agent': UA } })
  if (!response.ok || !response.body) throw new Error(`GTNH download failed (HTTP ${response.status}).`)
  const expected = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(expected) && (expected <= 0 || expected > MAX_ARCHIVE_BYTES)) {
    throw new Error('The official GTNH archive has an unexpected size.')
  }

  const file = await open(outputPath, 'w')
  const reader = response.body.getReader()
  let downloaded = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      downloaded += value.byteLength
      if (downloaded > MAX_ARCHIVE_BYTES) throw new Error('The GTNH archive exceeded the safe download limit.')
      await file.write(value)
      const percent = Number.isFinite(expected) ? Math.round((downloaded / expected) * 40) : undefined
      report({ instanceId, message: `Downloading GTNH ${release.version}…`, percent })
    }
  } finally {
    await file.close()
  }
  if (Number.isFinite(expected) && downloaded !== expected) throw new Error('The GTNH download was incomplete.')
}

async function copyPreservedData(sourceGame: string, destinationGame: string): Promise<void> {
  for (const relative of PRESERVED_DIRECTORIES) {
    const source = join(sourceGame, relative)
    if (!existsSync(source) || lstatSync(source).isSymbolicLink()) continue
    await cp(source, join(destinationGame, relative), { recursive: true, force: true })
  }
  for (const relative of PRESERVED_FILES) {
    const source = join(sourceGame, relative)
    if (!existsSync(source) || lstatSync(source).isSymbolicLink()) continue
    const destination = join(destinationGame, relative)
    await mkdir(dirname(destination), { recursive: true })
    await cp(source, destination, { force: true })
  }
}

export async function installGTNHUpdate(
  instanceId: string,
  report: (progress: GTNHUpdateProgress) => void,
  channel: GTNHUpdateInfo['channel'] = 'stable'
): Promise<Instance> {
  const { instance, currentVersion } = requireGTNH(instanceId)
  const release = selectGTNHUpdateRelease(await releasesForChannel(channel), currentVersion)
  if (compareGTNHVersions(release.version, currentVersion) <= 0) {
    throw new Error(`GTNH ${currentVersion} is already newer than or equal to the latest ${channel} release.`)
  }

  await ensureDiskSpace(instanceId, release.url, true)

  const tempDir = join(app.getPath('temp'), `thendrask-gtnh-update-${randomUUID()}`)
  const archivePath = join(tempDir, release.fileName)
  mkdirSync(tempDir, { recursive: true })
  let createdId: string | undefined
  try {
    await downloadRelease(release, archivePath, report, instanceId)
    report({ instanceId, message: `Installing a fresh GTNH ${release.version} instance…`, percent: 42 })
    const created = createInstance({
      name: `GTNH ${release.version}`,
      mcVersion: '1.7.10',
      loader: 'forge',
      source: 'manual',
      packVersionId: release.version
    })
    createdId = created.id
    const result = await importLocalPack(created.id, archivePath, (message, percent) => {
      report({ instanceId, message, percent: percent === undefined ? undefined : 42 + Math.round(percent * 0.38) })
    })

    report({ instanceId, message: 'Migrating worlds, maps, and personal settings…', percent: 82 })
    await copyPreservedData(instanceGameDir(instanceId), instanceGameDir(created.id))
    const updated = updateInstance(created.id, {
      name: `GTNH ${release.version}`,
      mcVersion: result.mcVersion,
      loader: result.marker.loaderType as Instance['loader'],
      loaderVersion: result.marker.loaderVersion,
      packVersionId: release.version,
      recommendedRamMb: result.recommendedRamMb,
      jvmArgs: result.jvmArgs,
      iconUrl: result.iconUrl,
      favorite: instance.favorite,
      group: instance.group,
      tags: instance.tags
    })
    if (!updated) throw new Error('The updated GTNH instance could not be saved.')
    report({ instanceId, message: `GTNH ${release.version} is ready. Your old instance was kept.`, percent: 100 })
    return updated
  } catch (error) {
    if (createdId && getInstance(createdId)) removeInstance(createdId, true)
    throw error
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export async function installGTNHSpecialBuild(
  instanceId: string,
  specialId: string,
  report: (progress: GTNHUpdateProgress) => void
): Promise<Instance> {
  const { instance } = requireGTNH(instanceId)
  if (!/^[a-z0-9-]{1,80}$/.test(specialId)) throw new Error('Invalid GTNH special build.')
  const response = await fetch(VERSION_HISTORY_URL, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`The official GTNH version history returned HTTP ${response.status}.`)
  const release = parseSpecialGTNHReleases(await response.text()).find((item) => item.id === specialId)
  if (!release) throw new Error('That GTNH special build is no longer listed by the official project.')
  await ensureDiskSpace(instanceId, release.url, false)

  const tempDir = join(app.getPath('temp'), `thendrask-gtnh-special-${randomUUID()}`)
  const archivePath = join(tempDir, release.fileName)
  mkdirSync(tempDir, { recursive: true })
  let createdId: string | undefined
  try {
    await downloadRelease({ version: release.title, fileName: release.fileName, url: release.url }, archivePath, report, instanceId)
    report({ instanceId, message: `Installing ${release.title} as an isolated instance…`, percent: 45 })
    const created = createInstance({
      name: `GTNH ${release.title}`,
      mcVersion: '1.7.10',
      loader: 'forge',
      source: 'manual',
      packVersionId: `special:${release.id}`
    })
    createdId = created.id
    const result = await importLocalPack(created.id, archivePath, (message, percent) => {
      report({ instanceId, message, percent: percent === undefined ? undefined : 45 + Math.round(percent * 0.54) })
    })
    const updated = updateInstance(created.id, {
      name: `GTNH ${release.title}`,
      mcVersion: result.mcVersion,
      loader: result.marker.loaderType as Instance['loader'],
      loaderVersion: result.marker.loaderVersion,
      packVersionId: `special:${release.id}`,
      recommendedRamMb: result.recommendedRamMb,
      jvmArgs: result.jvmArgs,
      iconUrl: result.iconUrl,
      group: instance.group,
      tags: [...new Set([...(instance.tags ?? []), 'GTNH special build'])]
    })
    if (!updated) throw new Error('The GTNH special instance could not be saved.')
    report({ instanceId, message: `${release.title} is ready as a separate instance.`, percent: 100 })
    return updated
  } catch (error) {
    if (createdId && getInstance(createdId)) removeInstance(createdId, true)
    throw error
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
