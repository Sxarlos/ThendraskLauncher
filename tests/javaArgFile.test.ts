import { describe, expect, it } from 'vitest'
import { needsJavaArgFile, serializeJavaArgFile } from '../src/main/javaArgFile'

describe('Java argument files', () => {
  it('uses an argument file for oversized Windows launches only', () => {
    const largeClasspath = 'C:\\instance\\libraries\\example.jar;'.repeat(1_000)
    const mediumClasspath = 'C:\\lib\\example.jar;'.repeat(400)
    expect(needsJavaArgFile('java.exe', ['-cp', largeClasspath, 'example.Main'], 'win32')).toBe(true)
    expect(needsJavaArgFile('java.exe', ['-cp', mediumClasspath, 'example.Main'], 'win32')).toBe(true)
    expect(needsJavaArgFile('java', ['-cp', largeClasspath, 'example.Main'], 'linux')).toBe(false)
    expect(needsJavaArgFile('java.exe', ['-Xmx4G', 'example.Main'], 'win32')).toBe(false)
  })

  it('quotes spaces, backslashes, and embedded quotes', () => {
    expect(serializeJavaArgFile([
      '-cp',
      'C:\\Minecraft Instances\\library.jar',
      '-Dexample="quoted value"'
    ])).toBe(
      '"-cp"\n"C:\\\\Minecraft Instances\\\\library.jar"\n"-Dexample=\\"quoted value\\""\n'
    )
  })
})
