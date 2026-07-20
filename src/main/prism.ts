import type AdmZip from 'adm-zip'

export const PRISM_PROFILE_FILE = '.thendrask-prism.json'

export interface PrismComponentRef {
  uid: string
  version?: string
  cachedVersion?: string
}

export interface PrismLibrary {
  name: string
  url?: string
  downloads?: Record<string, unknown>
  rules?: unknown[]
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  [key: string]: unknown
}

export interface PrismComponent {
  uid?: string
  version?: string
  order?: number
  mainClass?: string
  mainJar?: PrismLibrary
  minecraftArguments?: string
  arguments?: { game?: unknown[]; jvm?: unknown[] }
  libraries?: PrismLibrary[]
  '+libraries'?: PrismLibrary[]
  jvmArgs?: string[]
  '+jvmArgs'?: string[]
  tweakers?: string[]
  '+tweakers'?: string[]
  compatibleJavaMajors?: number[]
  assetIndex?: Record<string, unknown>
  assets?: string
  releaseTime?: string
  type?: string
  [key: string]: unknown
}

export interface PrismLaunchProfile {
  formatVersion: 1
  versionId: string
  mcVersion: string
  javaMajor?: number
  jvmArgs: string[]
  versionJson: Record<string, unknown>
}

/** Locate mmc-pack.json even when an exported instance is wrapped in a folder. */
export function findPrismRoot(entries: AdmZip.IZipEntry[]): string | null {
  const candidates = entries
    .map((entry) => entry.entryName.replace(/\\/g, '/'))
    .filter((name) => name === 'mmc-pack.json' || name.endsWith('/mmc-pack.json'))
    .sort((a, b) => a.split('/').length - b.split('/').length)
  if (!candidates.length) return null
  return candidates[0].slice(0, -'mmc-pack.json'.length)
}

export function parseInstanceCfg(text: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('[')) continue
    const equals = line.indexOf('=')
    if (equals <= 0) continue
    let value = line.slice(equals + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    values[line.slice(0, equals).trim()] = value
  }
  return values
}

const ICON_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon'
}

/** Resolve the icon referenced by instance.cfg and freeze it as a renderer-safe data URL. */
export function findPrismIconDataUrl(
  zip: AdmZip,
  root: string,
  cfg: Record<string, string>
): string | undefined {
  const rootEntries = zip.getEntries().filter((entry) => {
    const name = entry.entryName.replace(/\\/g, '/')
    const relative = name.startsWith(root) ? name.slice(root.length) : ''
    return !entry.isDirectory && relative.length > 0 && !relative.includes('/')
  })
  const iconKey = cfg.iconKey?.trim().toLowerCase()
  const supported = rootEntries.filter((entry) => {
    const extension = entry.entryName.split('.').pop()?.toLowerCase() ?? ''
    return extension in ICON_MIME_TYPES
  })
  const icon = supported.find((entry) => {
    if (!iconKey) return false
    const filename = entry.entryName.split('/').pop()!.toLowerCase()
    const stem = filename.slice(0, filename.lastIndexOf('.'))
    return filename === iconKey || stem === iconKey
  }) ?? supported.find((entry) => /(?:^|[_-])(icon|logo)(?:[_.-]|$)/i.test(entry.entryName.split('/').pop()!))

  if (!icon || icon.header.size > 2 * 1024 * 1024) return undefined
  const extension = icon.entryName.split('.').pop()!.toLowerCase()
  return `data:${ICON_MIME_TYPES[extension]};base64,${icon.getData().toString('base64')}`
}

function mergeUniqueLibraries(target: PrismLibrary[], additions: PrismLibrary[]): void {
  for (const library of additions) {
    const coordinateKey = (name: string): string => name.split(':').slice(0, 2).join(':')
    const key = coordinateKey(library.name)
    const index = target.findIndex((existing) => coordinateKey(existing.name) === key)
    if (index === -1) target.push(library)
    else target[index] = library
  }
}

/** Merge Prism/OneSix components in their declared order into an MCLC version profile. */
export function mergePrismComponents(
  components: PrismComponent[],
  mcVersion: string,
  versionId = 'thendrask-prism'
): PrismLaunchProfile {
  const ordered = [...components].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const versionJson: Record<string, any> = {
    id: versionId,
    type: 'release',
    libraries: [] as PrismLibrary[]
  }
  const jvmArgs: string[] = []
  const gameArgs: unknown[] = []
  const tweakers: string[] = []
  const compatibleJavaMajors = new Set<number>()

  for (const component of ordered) {
    if (component.mainClass) versionJson.mainClass = component.mainClass
    if (component.mainJar?.downloads) versionJson.downloads = component.mainJar.downloads
    if (component.minecraftArguments) versionJson.minecraftArguments = component.minecraftArguments
    if (component.assetIndex) versionJson.assetIndex = component.assetIndex
    if (component.assets) versionJson.assets = component.assets
    if (component.releaseTime) versionJson.releaseTime = component.releaseTime
    if (component.type) versionJson.type = component.type

    if (component.jvmArgs) {
      jvmArgs.length = 0
      jvmArgs.push(...component.jvmArgs)
    }
    jvmArgs.push(...(component['+jvmArgs'] ?? []))
    if (component.arguments?.jvm) jvmArgs.push(...component.arguments.jvm.filter((arg): arg is string => typeof arg === 'string'))

    if (component.arguments?.game) gameArgs.push(...component.arguments.game)
    if (component.tweakers) {
      tweakers.length = 0
      tweakers.push(...component.tweakers)
    }
    tweakers.push(...(component['+tweakers'] ?? []))

    mergeUniqueLibraries(versionJson.libraries, component.libraries ?? [])
    mergeUniqueLibraries(versionJson.libraries, component['+libraries'] ?? [])
    for (const major of component.compatibleJavaMajors ?? []) compatibleJavaMajors.add(major)
  }

  for (const tweaker of tweakers) gameArgs.push('--tweakClass', tweaker)
  if (gameArgs.length) {
    if (versionJson.minecraftArguments) {
      versionJson.minecraftArguments += ` ${gameArgs.filter((arg) => typeof arg === 'string').join(' ')}`
    } else {
      versionJson.arguments = { game: gameArgs, jvm: [] }
    }
  }

  if (!versionJson.mainClass) throw new Error('Prism pack has no launch main class.')
  if (!versionJson.downloads?.artifact?.url && !versionJson.downloads?.client?.url) {
    throw new Error('Prism pack does not declare a downloadable Minecraft client JAR.')
  }
  // Prism calls the main client artifact `mainJar`; MCLC expects downloads.client.
  if (versionJson.downloads.artifact) versionJson.downloads = { client: versionJson.downloads.artifact }

  const javaMajor = compatibleJavaMajors.has(21)
    ? 21
    : [...compatibleJavaMajors].sort((a, b) => a - b)[0]

  return { formatVersion: 1, versionId, mcVersion, javaMajor, jvmArgs, versionJson }
}
