/**
 * Compile-time capabilities. These values are replaced by electron-vite and
 * are deliberately not read from settings, command-line arguments, or the
 * runtime environment.
 */
export const CURSEFORGE_ENABLED =
  typeof __CURSEFORGE_ENABLED__ !== 'undefined' && __CURSEFORGE_ENABLED__

/**
 * ATLauncher and Technic are excluded from public builds unless the
 * distributor has obtained permission to reuse their catalogue content.
 */
export const RESTRICTED_CATALOGS_ENABLED =
  typeof __RESTRICTED_CATALOGS_ENABLED__ !== 'undefined'
  && __RESTRICTED_CATALOGS_ENABLED__

export type ModpackProvider =
  | 'modrinth'
  | 'curseforge'
  | 'ftb'
  | 'ftb-legacy'
  | 'atlauncher'
  | 'technic'

const ALL_MODPACK_PROVIDERS: readonly ModpackProvider[] = [
  'modrinth',
  'curseforge',
  'ftb',
  'ftb-legacy',
  'atlauncher',
  'technic'
]

export function availableModpackProviders(): ModpackProvider[] {
  return ALL_MODPACK_PROVIDERS.filter(
    (provider) =>
      (provider !== 'curseforge' || CURSEFORGE_ENABLED)
      && (!['atlauncher', 'technic'].includes(provider) || RESTRICTED_CATALOGS_ENABLED)
  )
}
