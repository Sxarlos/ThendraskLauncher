import { describe, expect, it } from 'vitest'
import { validateCreateInstanceInput } from '../src/main/instances'

describe('instance creation validation', () => {
  it('normalizes a valid request and applies safe defaults', () => {
    expect(validateCreateInstanceInput({
      name: '  My Pack  ',
      mcVersion: '1.21.1'
    })).toEqual({
      name: 'My Pack',
      mcVersion: '1.21.1',
      loader: 'vanilla',
      source: 'manual',
      loaderVersion: undefined,
      externalId: undefined,
      packVersionId: undefined,
      iconUrl: undefined
    })
  })

  it.each([
    null,
    {},
    { name: '', mcVersion: '1.21.1' },
    { name: 'Pack', mcVersion: '../1.21.1' },
    { name: 'Pack', mcVersion: '1.21.1', loader: 'unsupported' },
    { name: 'Pack', mcVersion: '1.21.1', source: 'unknown' },
    { name: 'Pack', mcVersion: '1.21.1', iconUrl: 'file:///tmp/icon.png' }
  ])('rejects malformed or unsupported input %#', (input) => {
    expect(() => validateCreateInstanceInput(input)).toThrow(/Invalid/)
  })

  it('accepts supported loaders, snapshot versions, and HTTPS icons', () => {
    expect(validateCreateInstanceInput({
      name: 'Snapshot',
      mcVersion: '25w36a',
      loader: 'neoforge',
      source: 'modrinth',
      externalId: 'example-pack',
      iconUrl: 'https://cdn.example.com/icon.png'
    })).toMatchObject({
      loader: 'neoforge',
      source: 'modrinth',
      mcVersion: '25w36a'
    })
  })
})
