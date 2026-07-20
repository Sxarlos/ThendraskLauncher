import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import {
  findPrismIconDataUrl,
  findPrismRoot,
  mergePrismComponents,
  parseInstanceCfg
} from '../src/main/prism'

describe('Prism instance support', () => {
  it('finds a wrapped mmc-pack.json', () => {
    const zip = new AdmZip()
    zip.addFile('GT New Horizons/mmc-pack.json', Buffer.from('{}'))
    zip.addFile('GT New Horizons/.minecraft/options.txt', Buffer.from(''))

    expect(findPrismRoot(zip.getEntries())).toBe('GT New Horizons/')
  })

  it('parses Prism instance settings', () => {
    const cfg = parseInstanceCfg(`
[General]
name=GT_New_Horizons_2.8.4_Java_17-25
JavaVersion=21.0.9
MaxMemAlloc=8192
JavaVendor="Azul Systems, Inc."
`)
    expect(cfg.name).toBe('GT_New_Horizons_2.8.4_Java_17-25')
    expect(cfg.JavaVersion).toBe('21.0.9')
    expect(cfg.MaxMemAlloc).toBe('8192')
    expect(cfg.JavaVendor).toBe('Azul Systems, Inc.')
  })

  it('imports the icon selected by Prism iconKey', () => {
    const zip = new AdmZip()
    zip.addFile('Example/mmc-pack.json', Buffer.from('{}'))
    zip.addFile('Example/gtnh_icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    expect(findPrismIconDataUrl(zip, 'Example/', { iconKey: 'gtnh_icon' })).toBe(
      'data:image/png;base64,iVBORw=='
    )
  })

  it('merges GTNH-style ordered components into a launch profile', () => {
    const profile = mergePrismComponents([
      {
        uid: 'net.minecraftforge',
        order: 5,
        mainClass: 'com.gtnewhorizons.retrofuturabootstrap.Main',
        '+tweakers': ['cpw.mods.fml.common.launcher.FMLTweaker'],
        libraries: [{ name: 'com.google.guava:guava:17.0' }]
      },
      {
        uid: 'net.minecraft',
        order: -2,
        mainClass: 'net.minecraft.client.main.Main',
        mainJar: {
          name: 'com.mojang:minecraft:1.7.10:client',
          downloads: { artifact: { url: 'https://example.test/client.jar', sha1: 'abc' } }
        },
        minecraftArguments: '--username ${auth_player_name}',
        compatibleJavaMajors: [17, 21, 25],
        libraries: [{ name: 'com.google.guava:guava:15.0' }]
      },
      {
        uid: 'me.eigenraven.lwjgl3ify.forgepatches',
        order: 3,
        '+jvmArgs': ['-Dfile.encoding=UTF-8', '--add-opens', 'java.base/java.lang=ALL-UNNAMED'],
        libraries: [{ name: 'com.github.GTNewHorizons:lwjgl3ify:2.1.16:forgePatches', 'MMC-hint': 'local' }]
      }
    ], '1.7.10')

    expect(profile.javaMajor).toBe(21)
    expect(profile.jvmArgs).toContain('-Dfile.encoding=UTF-8')
    expect(profile.versionJson.mainClass).toBe('com.gtnewhorizons.retrofuturabootstrap.Main')
    expect(profile.versionJson.downloads).toEqual({
      client: { url: 'https://example.test/client.jar', sha1: 'abc' }
    })
    expect(profile.versionJson.minecraftArguments).toContain(
      '--tweakClass cpw.mods.fml.common.launcher.FMLTweaker'
    )
    expect((profile.versionJson.libraries as Array<{ name: string }>).map((lib) => lib.name)).toEqual([
      'com.google.guava:guava:17.0',
      'com.github.GTNewHorizons:lwjgl3ify:2.1.16:forgePatches'
    ])
  })

  it.runIf(Boolean(process.env.GTNH_ZIP))('merges the real GTNH Prism archive', () => {
    const zip = new AdmZip(process.env.GTNH_ZIP!)
    const root = findPrismRoot(zip.getEntries())
    expect(root).not.toBeNull()
    const pack = JSON.parse(zip.getEntry(`${root}mmc-pack.json`)!.getData().toString('utf8')) as {
      components: Array<{ uid: string; version?: string; cachedVersion?: string }>
    }
    const components = pack.components.map((ref) =>
      JSON.parse(zip.getEntry(`${root}patches/${ref.uid}.json`)!.getData().toString('utf8'))
    )
    const profile = mergePrismComponents(components, '1.7.10')
    const libraries = profile.versionJson.libraries as Array<{ name: string }>

    expect(profile.javaMajor).toBe(21)
    expect(profile.versionJson.mainClass).toBe('com.gtnewhorizons.retrofuturabootstrap.Main')
    expect(profile.jvmArgs).toContain(
      '-Djava.system.class.loader=com.gtnewhorizons.retrofuturabootstrap.RfbSystemClassLoader'
    )
    expect(libraries.length).toBeGreaterThan(100)
    expect(libraries.some((lib) => lib.name.includes('lwjgl3ify'))).toBe(true)
  })
})
