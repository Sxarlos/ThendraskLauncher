import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildLauncherOptions,
  quickPlayType,
  type BuildLauncherOptionsInput
} from '../src/main/launcherOptions'

const authorization = {
  access_token: 'obviously-fake-access-token',
  client_token: 'obviously-fake-client-token',
  uuid: '1234567890abcdef1234567890abcdef',
  name: 'TestPlayer'
}

function base(overrides: Partial<BuildLauncherOptionsInput> = {}): BuildLauncherOptionsInput {
  return {
    authorization,
    root: 'C:\\Instances\\Example',
    gameDir: 'C:\\Instances\\Example',
    mcVersion: '1.20.1',
    versionType: 'release',
    maxRamMb: 4096,
    resolvedJavaPath: 'java',
    ...overrides
  }
}

describe('launcher-core option construction', () => {
  it('builds stable vanilla options and normalizes missing user properties', () => {
    expect(buildLauncherOptions(base())).toEqual({
      authorization: {
        ...authorization,
        user_properties: '{}'
      },
      root: 'C:\\Instances\\Example',
      version: {
        number: '1.20.1',
        type: 'release',
        custom: undefined
      },
      memory: {
        max: '4096M',
        min: '512M'
      },
      javaPath: undefined
    })
  })

  it('preserves serialized online and offline authorization properties', () => {
    const online = buildLauncherOptions(base({
      authorization: { ...authorization, user_properties: '{"online":true}' }
    }))
    const offline = buildLauncherOptions(base({
      authorization: {
        ...authorization,
        access_token: 'offline',
        client_token: 'offline',
        user_properties: {}
      }
    }))

    expect((online.authorization as typeof authorization & { user_properties: string }).user_properties)
      .toBe('{"online":true}')
    expect((offline.authorization as typeof authorization & { user_properties: string }).user_properties)
      .toBe('{}')
  })

  it.each([
    ['fabric', 'fabric-loader-0.16.0-1.20.1'],
    ['quilt', 'quilt-loader-0.27.0-1.20.1'],
    ['neoforge', 'neoforge-20.4.200']
  ])('passes the installed %s profile as a custom version', (_loader, customVersion) => {
    expect(buildLauncherOptions(base({ customVersion })).version.custom).toBe(customVersion)
  })

  it('passes Forge through its installer option', () => {
    const options = buildLauncherOptions(base({
      forgeInstallerPath: 'C:\\Installers\\forge-installer.jar'
    }))
    expect(options.forge).toBe('C:\\Installers\\forge-installer.jar')
    expect(options.version.custom).toBeUndefined()
  })

  it('uses recommended pack memory only when enabled', () => {
    expect(buildLauncherOptions(base({
      usePackRam: true,
      recommendedRamMb: 6144
    })).memory.max).toBe('6144M')
    expect(buildLauncherOptions(base({
      usePackRam: false,
      recommendedRamMb: 6144
    })).memory.max).toBe('4096M')
  })

  it('combines Prism, NeoForge, and user JVM arguments in order', () => {
    const options = buildLauncherOptions(base({
      prismProfile: {
        versionId: 'gtnh-profile',
        jvmArgs: ['-Dprism=true']
      },
      neoforgeJvmArgs: ['-Dneoforge=true'],
      instanceJvmArgs: '-XX:+UseG1GC -Dplayer="Alex Smith"',
      resolvedJavaPath: 'C:\\Java\\bin\\javaw.exe'
    }))

    expect(options.customArgs).toEqual([
      '-Dprism=true',
      '-Dneoforge=true',
      '-XX:+UseG1GC',
      '-Dplayer=Alex Smith'
    ])
    expect(options.javaPath).toBe('C:\\Java\\bin\\javaw.exe')
    expect(options.overrides?.versionJson).toBe(
      join('C:\\Instances\\Example', 'versions', 'gtnh-profile', 'gtnh-profile.json')
    )
  })

  it.each([
    ['1.7.10', 'legacy'],
    ['1.19.4', 'legacy'],
    ['1.20', 'multiplayer'],
    ['1.21.1', 'multiplayer']
  ] as const)('uses %s quick play as %s', (mcVersion, type) => {
    expect(quickPlayType(mcVersion)).toBe(type)
    expect(buildLauncherOptions(base({
      mcVersion,
      serverAddress: 'play.example.test:25565'
    })).quickPlay).toEqual({
      type,
      identifier: 'play.example.test:25565'
    })
  })

  it('preserves snapshot version metadata', () => {
    expect(buildLauncherOptions(base({
      mcVersion: '26w10a',
      versionType: 'snapshot'
    })).version).toEqual({
      number: '26w10a',
      type: 'snapshot',
      custom: undefined
    })
  })
})
