/**
 * Compile-time capabilities. These values are replaced by electron-vite and
 * are deliberately not read from settings, command-line arguments, or the
 * runtime environment.
 */
export const CURSEFORGE_ENABLED =
  typeof __CURSEFORGE_ENABLED__ !== 'undefined' && __CURSEFORGE_ENABLED__

export type ModpackProvider =
  | 'modrinth'
  | 'curseforge'

const ALL_MODPACK_PROVIDERS: readonly ModpackProvider[] = [
  'modrinth',
  'curseforge'
]

export interface ModpackProviderModule {
  id: ModpackProvider
  label: string
  enabled: boolean
  approval: 'approved' | 'pending'
}

/** Single registry used by the UI and policy layer to expose provider modules. */
export const MODPACK_PROVIDER_MODULES: readonly ModpackProviderModule[] = [
  { id: 'modrinth', label: 'Modrinth', enabled: true, approval: 'approved' },
  { id: 'curseforge', label: 'CurseForge', enabled: CURSEFORGE_ENABLED, approval: 'approved' }
]

export function isModpackProviderEnabled(provider: ModpackProvider): boolean {
  return MODPACK_PROVIDER_MODULES.find((module) => module.id === provider)?.enabled ?? false
}

export function availableModpackProviders(): ModpackProvider[] {
  return ALL_MODPACK_PROVIDERS.filter(isModpackProviderEnabled)
}
