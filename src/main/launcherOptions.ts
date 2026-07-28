import { join } from 'path'
import type { Client } from 'minecraft-launcher-core'
import { parseJvmArgs } from './jvmArgs'

type LauncherOptions = Parameters<Client['launch']>[0]
type LaunchAuthorization = LauncherOptions['authorization']

export interface LauncherAuthorizationInput {
  access_token: string
  client_token?: string
  uuid: string
  name?: string
  user_properties?: unknown
  meta?: unknown
}

export interface PrismLaunchOptions {
  versionId: string
  jvmArgs: string[]
}

export interface BuildLauncherOptionsInput {
  authorization: LauncherAuthorizationInput
  root: string
  gameDir: string
  mcVersion: string
  versionType: string
  customVersion?: string
  forgeInstallerPath?: string
  maxRamMb: number
  usePackRam?: boolean
  recommendedRamMb?: number
  resolvedJavaPath: string
  serverAddress?: string
  instanceJvmArgs?: string
  prismProfile?: PrismLaunchOptions | null
  neoforgeJvmArgs?: string[]
}

export function quickPlayType(mcVersion: string): 'multiplayer' | 'legacy' {
  const [, minor = '0'] = mcVersion.split('.')
  return parseInt(minor, 10) >= 20 ? 'multiplayer' : 'legacy'
}

/**
 * Build the stable contract passed to minecraft-launcher-core. Keeping this
 * pure makes upgrades or replacement of that dependency testable without
 * downloading files or starting Java.
 */
export function buildLauncherOptions(input: BuildLauncherOptionsInput): LauncherOptions {
  const launchAuthorization = {
    ...input.authorization,
    user_properties: typeof input.authorization.user_properties === 'string'
      ? input.authorization.user_properties
      : JSON.stringify(input.authorization.user_properties ?? {})
  } as unknown as LaunchAuthorization

  const userArgs = parseJvmArgs(input.instanceJvmArgs ?? '')
  const customArgs = [
    ...(input.prismProfile?.jvmArgs ?? []),
    ...(input.neoforgeJvmArgs ?? []),
    ...userArgs
  ]

  return {
    authorization: launchAuthorization,
    root: input.root,
    version: {
      number: input.mcVersion,
      type: input.versionType,
      custom: input.customVersion
    },
    ...(input.forgeInstallerPath ? { forge: input.forgeInstallerPath } : {}),
    memory: {
      max: `${input.usePackRam && input.recommendedRamMb ? input.recommendedRamMb : input.maxRamMb}M`,
      min: '512M'
    },
    javaPath: input.resolvedJavaPath === 'java' ? undefined : input.resolvedJavaPath,
    ...(input.serverAddress ? {
      quickPlay: {
        type: quickPlayType(input.mcVersion),
        identifier: input.serverAddress
      }
    } : {}),
    ...(customArgs.length > 0 ? { customArgs } : {}),
    ...(input.prismProfile ? {
      overrides: {
        versionJson: join(
          input.gameDir,
          'versions',
          input.prismProfile.versionId,
          `${input.prismProfile.versionId}.json`
        )
      }
    } : {})
  }
}
