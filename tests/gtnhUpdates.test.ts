import { describe, expect, it } from 'vitest'
import { compareGTNHVersions, parseBetaGTNHReleases, parseSpecialGTNHReleases, parseStableGTNHReleases, selectGTNHUpdateRelease } from '../src/main/gtnhUpdates'

describe('GTNH stable pack updates', () => {
  const html = `
    <a href="https://downloads.gtnewhorizons.com/Multi_mc_downloads/betas/GT_New_Horizons_2.9.0-beta-2_Java_17-25.zip">beta</a>
    GT_New_Horizons_2.9.0_Java_17-25.zip
    GT_New_Horizons_2.8.4_Java_17-25.zip
    GT_New_Horizons_2.8.4_Server_Java_17-25.zip
    GT_New_Horizons_2.7.4_Java_17-21.zip
  `

  it('finds stable client archives while excluding beta and server packages', () => {
    expect(parseStableGTNHReleases(html).map((release) => release.version)).toEqual(['2.9.0', '2.8.4', '2.7.4'])
  })

  it('discovers preview builds only through the separate beta parser', () => {
    const releases = parseBetaGTNHReleases(html)
    expect(releases.map((release) => release.version)).toEqual(['2.9.0-beta-2'])
    expect(releases[0].url).toContain('/betas/')
  })

  it('orders semantic versions numerically', () => {
    expect(compareGTNHVersions('2.10.0', '2.9.9')).toBeGreaterThan(0)
    expect(compareGTNHVersions('2.8.4', '2.8.4')).toBe(0)
    expect(compareGTNHVersions('2.9.0-beta-2', '2.9.0-beta-1')).toBeGreaterThan(0)
    expect(compareGTNHVersions('2.9.0', '2.9.0-beta-2')).toBeGreaterThan(0)
  })

  it('uses the newest stable release when it is the next pack generation', () => {
    const releases = parseStableGTNHReleases(html)
    expect(selectGTNHUpdateRelease(releases, '2.8.4').version).toBe('2.9.0')
  })

  it('does not skip a pack generation during migration', () => {
    const releases = parseStableGTNHReleases(html)
    expect(selectGTNHUpdateRelease(releases, '2.7.0').version).toBe('2.8.4')
  })

  it('associates the official changelog with its release', () => {
    const releaseHtml = `
      <details><summary><span class="font-semibold">2.8.4</span></summary>
      <a href="https://github.com/GTNewHorizons/GT-New-Horizons-Modpack/releases/tag/2.8.4">Click here to get the changelog</a>
      GT_New_Horizons_2.8.4_Java_17-25.zip</details>`
    expect(parseStableGTNHReleases(releaseHtml)[0].changelogUrl).toContain('/tag/2.8.4')
  })

  it('discovers April Fools builds as separate manual installs', () => {
    const specialHtml = `
      <details><summary><span class="font-semibold">April fools 2025</span></summary>
      <span data-icon="mdi:calendar"></span><span>2025/04/01</span>
      <p class="mb-4 text-gray-300">Try to craft the Steam Gate!</p>
      <a href="https://downloads.gtnewhorizons.com/Multi_mc_downloads/GT_New_Horizons_Aprils_Fool_2025_Edition_Java_17-21.zip">Download</a>
      </details>`
    expect(parseSpecialGTNHReleases(specialHtml)).toEqual([expect.objectContaining({
      id: 'april-fools-2025',
      title: 'April fools 2025',
      date: '2025/04/01',
      description: 'Try to craft the Steam Gate!'
    })])
  })
})
