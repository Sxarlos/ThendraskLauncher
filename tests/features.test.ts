import { describe, expect, it } from 'vitest'
import {
  availableModpackProviders,
  CURSEFORGE_ENABLED
} from '../src/shared/features'

describe('public provider capabilities', () => {
  it('exposes only approved public-build catalogues', () => {
    expect(CURSEFORGE_ENABLED).toBe(false)
    expect(availableModpackProviders()).toEqual(['modrinth'])
  })
})
