import { describe, expect, it } from 'vitest'
import { parseJvmArgs } from '../src/main/jvmArgs'

describe('parseJvmArgs', () => {
  it('supports whitespace and one argument per line', () => {
    expect(parseJvmArgs('-XX:+UseG1GC\n-Xmx4G  -Ddemo=true')).toEqual([
      '-XX:+UseG1GC',
      '-Xmx4G',
      '-Ddemo=true'
    ])
  })

  it('preserves spaces inside quoted values', () => {
    expect(parseJvmArgs('-Dpath="C:\\Program Files\\Java" \'-Dplayer=Alex Smith\'')).toEqual([
      '-Dpath=C:\\Program Files\\Java',
      '-Dplayer=Alex Smith'
    ])
  })

  it('preserves ordinary Windows path separators', () => {
    expect(parseJvmArgs('-Dpath=C:\\Java\\bin')).toEqual(['-Dpath=C:\\Java\\bin'])
  })

  it('supports escaped spaces and quotes', () => {
    expect(parseJvmArgs('-Dname=Alex\\ Smith -Dquote=\\"hello\\"')).toEqual([
      '-Dname=Alex Smith',
      '-Dquote="hello"'
    ])
  })

  it('rejects an unclosed quote', () => {
    expect(() => parseJvmArgs('-Dpath="C:\\Program Files')).toThrow('Unclosed quote')
  })
})
