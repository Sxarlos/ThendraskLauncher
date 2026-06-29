// Shared types used across the main process, preload bridge, and renderer UI.

export type Page = 'home' | 'library' | 'servers' | 'friends' | 'settings'

/** Available UI themes. 'ender' is the default dark green. */
export type ThemeId =
  | 'ender'
  | 'amethyst'
  | 'ocean'
  | 'crimson'
  | 'gold'
  | 'midnight'
  | 'light'

/** A logged-in Minecraft account (Microsoft/Xbox auth). */
export interface Account {
  id: string // Minecraft profile UUID
  username: string // in-game name
  active: boolean
}

export type LoaderType = 'vanilla' | 'fabric' | 'forge' | 'quilt' | 'neoforge'

/** A locally installed game instance (vanilla or a modpack). */
export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
  source?: 'manual' | 'modrinth' | 'curseforge' | 'ftb' | 'ftb-legacy' | 'atlauncher' | 'technic'
  externalId?: string        // Modrinth project_id or CurseForge mod id
  packVersionId?: string     // Specific version ID from Modrinth/CurseForge
  iconUrl?: string
  screenshotUrls?: string[]  // Gallery images fetched from the source platform
  lastPlayed?: number
  timePlayed?: number         // total milliseconds played across all sessions
  recommendedRamMb?: number
  jvmArgs?: string           // Extra JVM flags for this instance (space/newline separated)
}

/** A specific version of a modpack from Modrinth or CurseForge. */
export interface PackVersion {
  id: string
  versionNumber: string
  name: string
  gameVersions: string[]
  loaders: string[]
  datePublished: string
}

/** A single mod included in an installed modpack. */
export interface PackMod {
  name: string
  optional: boolean
  serverOnly: boolean
  iconUrl?: string
}

/** A saved server entry the user wants to monitor. */
export interface ServerEntry {
  id: string
  name: string
  host: string
  port: number // game port (default 25565)
  permanent?: boolean // hardcoded by the launcher — cannot be removed
  rconPort?: number
  // RCON password is stored separately/securely; never returned to the renderer.
  hasRconPassword?: boolean
  // For local servers we can start/stop ourselves:
  startCommand?: string
  workingDir?: string
}

/** Result of pinging a Minecraft server (status card data). */
export interface ServerStatus {
  online: boolean
  players?: { online: number; max: number; sample?: string[] }
  version?: string
  motd?: string
  favicon?: string // base64 PNG data URL from the server
  latencyMs?: number
  error?: string
}

export interface MojangVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export interface DefaultGameSettings {
  renderDistance?: number   // 2–32
  graphics?: 'fast' | 'fancy' | 'fabulous'
  particles?: 'all' | 'decreased' | 'minimal'
  fov?: number              // 30–110 degrees
}

export interface AppSettings {
  javaPath?: string
  maxRamMb: number
  instancesDir?: string
  noChatRestrictions?: boolean
  usePackRam?: boolean
  defaultGameSettings?: DefaultGameSettings
  curseforgeApiKey?: string
  friendCode?: string   // this user's own relay code (auto-generated)
  relayUrl?: string     // URL of the hosted presence relay
  theme?: ThemeId       // UI theme (default 'ender')
  discordRpc?: boolean
  discordClientId?: string
  setupComplete?: boolean
}

export interface JavaInstall {
  path: string
  version: string
  vendor?: string
  major: number
}

export interface Friend {
  id: string
  name: string   // local display name
  code: string   // relay friend code (XXXXX-XXXXX)
}

export interface FriendPresence {
  online: boolean
  idle?: boolean
  username?: string
  playing?: string | null
  mcVersion?: string | null
  loader?: string | null
  since?: number | null
  lastSeen?: number
}

export interface ModpackResult {
  id: string
  name: string
  description: string
  iconUrl?: string
  downloads: number
  categories: string[]
  mcVersions: string[]
  loaders: string[]
  source: 'modrinth' | 'curseforge' | 'ftb' | 'ftb-legacy' | 'atlauncher' | 'technic'
  externalUrl?: string
  author?: string
}

export interface BrowseParams {
  query?: string
  loader?: string
  mcVersion?: string
  limit?: number
  offset?: number
  privateCode?: string
  sort?: 'downloads' | 'updated' | 'newest'
  category?: string
}

export interface MinecraftSkin {
  id: string
  state: 'ACTIVE' | 'INACTIVE'
  url: string
  variant: 'CLASSIC' | 'SLIM'
}

export interface MinecraftCape {
  id: string
  state: 'ACTIVE' | 'INACTIVE'
  url: string
  alias: string
}

export interface MinecraftProfile {
  id: string
  name: string
  skins: MinecraftSkin[]
  capes: MinecraftCape[]
}

export interface VersionChangelog {
  id: string
  versionNumber: string
  name: string
  datePublished: string
  changelog: string
}

export interface PackOverview {
  description: string       // long description (Markdown from Modrinth, plain from CurseForge)
  screenshotUrls: string[]  // gallery images
  externalUrl?: string      // link to the pack page
  downloads?: number
  author?: string
}

export interface UpdateInfo {
  version: string       // e.g. "1.2.0"
  notes?: string        // short release notes shown in the banner
  downloadUrl: string   // URL opened when the user clicks Download
}

export type LaunchState = 'idle' | 'preparing' | 'downloading' | 'launching' | 'running' | 'closed' | 'error'

export interface LaunchProgress {
  instanceId: string
  state: LaunchState
  message?: string
  percent?: number
}
