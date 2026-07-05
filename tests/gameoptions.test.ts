import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { applyControls, writeDefaultOptions } from '../src/main/gameoptions'

describe('applyControls', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gameoptions-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates options.txt when absent', () => {
    applyControls(dir, '1.20.1', { 'key.forward': 'key.keyboard.w' })
    const file = join(dir, 'options.txt')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('key_key.forward:key.keyboard.w\n')
  })

  it('replaces matching key_ lines in place, preserving order and unrelated lines', () => {
    const file = join(dir, 'options.txt')
    writeFileSync(
      file,
      ['renderDistance:12', 'key_key.forward:key.keyboard.up', 'fov:0.000000', 'key_key.back:key.keyboard.down'].join('\n') + '\n',
      'utf-8'
    )

    applyControls(dir, '1.20.1', { 'key.forward': 'key.keyboard.w' })

    const lines = readFileSync(file, 'utf-8').split('\n')
    expect(lines).toEqual([
      'renderDistance:12',
      'key_key.forward:key.keyboard.w',
      'fov:0.000000',
      'key_key.back:key.keyboard.down',
      '', // trailing newline
    ])
  })

  it('appends managed lines that are not already present', () => {
    const file = join(dir, 'options.txt')
    writeFileSync(file, 'renderDistance:12\n', 'utf-8')

    applyControls(dir, '1.20.1', { 'key.forward': 'key.keyboard.w', 'key.jump': 'key.keyboard.space' })

    const content = readFileSync(file, 'utf-8')
    expect(content).toBe(
      ['renderDistance:12', 'key_key.forward:key.keyboard.w', 'key_key.jump:key.keyboard.space', ''].join('\n')
    )
  })

  it('writes both swapOffhand and swapHands lines for the swap-offhand action', () => {
    applyControls(dir, '1.20.1', { 'key.swapOffhand': 'key.keyboard.f' })
    const content = readFileSync(join(dir, 'options.txt'), 'utf-8')
    expect(content).toContain('key_key.swapOffhand:key.keyboard.f')
    expect(content).toContain('key_key.swapHands:key.keyboard.f')
  })

  it('no-ops below 1.13', () => {
    applyControls(dir, '1.12.2', { 'key.forward': 'key.keyboard.w' })
    expect(existsSync(join(dir, 'options.txt'))).toBe(false)
  })

  it('no-ops on empty controls', () => {
    applyControls(dir, '1.20.1', {})
    expect(existsSync(join(dir, 'options.txt'))).toBe(false)
  })
})

describe('writeDefaultOptions', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gameoptions-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('never overwrites an existing options.txt', () => {
    const file = join(dir, 'options.txt')
    writeFileSync(file, 'renderDistance:4\n', 'utf-8')

    writeDefaultOptions(dir, '1.20.1', { renderDistance: 16 })

    expect(readFileSync(file, 'utf-8')).toBe('renderDistance:4\n')
  })

  it('no-ops below the 1.12 version gate', () => {
    writeDefaultOptions(dir, '1.11.2', { renderDistance: 16 })
    expect(existsSync(join(dir, 'options.txt'))).toBe(false)
  })

  it('creates options.txt with the given settings at 1.12+', () => {
    writeDefaultOptions(dir, '1.12.2', { renderDistance: 16, graphics: 'fast', particles: 'minimal' })
    const content = readFileSync(join(dir, 'options.txt'), 'utf-8')
    expect(content).toContain('renderDistance:16')
    expect(content).toContain('graphicsMode:1')
    expect(content).toContain('fancyGraphics:false')
    expect(content).toContain('particles:2')
  })
})
