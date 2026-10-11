import { describe, expect, it } from 'vitest'
import { resolvePackRelease } from '../src/main/packRelease'

const input = { name: 'Pack', mcVersion: '1.9', loader: 'forge' as const, source: 'modrinth' as const }
const releases = [
  { id: 'new', name: 'New', versionNumber: '2', gameVersions: ['1.21.1'], loaders: ['fabric'], datePublished: '' },
  { id: 'old', name: 'Old', versionNumber: '1', gameVersions: ['1.20.1'], loaders: ['forge'], datePublished: '' }
]

describe('pack release selection', () => {
  it('uses game and loader metadata from the chosen release, not the project summary', () => {
    expect(resolvePackRelease(input, releases)).toMatchObject({ packVersionId: 'new', mcVersion: '1.21.1', loader: 'fabric' })
    expect(resolvePackRelease({ ...input, packVersionId: 'old' }, releases)).toMatchObject({ packVersionId: 'old', mcVersion: '1.20.1', loader: 'forge' })
  })
  it('rejects a missing release instead of installing an unrelated archive', () => {
    expect(() => resolvePackRelease({ ...input, packVersionId: 'missing' }, releases)).toThrow(/unavailable/)
    expect(() => resolvePackRelease(input, [])).toThrow(/unavailable/)
  })
})
