import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { JavaInstall } from '@shared/types'

const execFileAsync = promisify(execFile)

const SCAN_ROOTS = [
  join('C:', 'Program Files', 'Java'),
  join('C:', 'Program Files', 'Eclipse Adoptium'),
  join('C:', 'Program Files', 'Microsoft'),
  join('C:', 'Program Files', 'Zulu'),
  join('C:', 'Program Files', 'BellSoft'),
  join('C:', 'Program Files', 'Amazon Corretto'),
  join('C:', 'Program Files', 'Semeru'),
  join('C:', 'Program Files (x86)', 'Java'),
]

function parseVendor(stderr: string): string | undefined {
  const l = stderr.toLowerCase()
  if (l.includes('adoptium') || l.includes('temurin')) return 'Eclipse Adoptium'
  if (l.includes('microsoft')) return 'Microsoft'
  if (l.includes('corretto') || (l.includes('amazon') && l.includes('java'))) return 'Amazon Corretto'
  if (l.includes('zulu') || l.includes('azul')) return 'Azul Zulu'
  if (l.includes('bellsoft') || l.includes('liberica')) return 'BellSoft Liberica'
  if (l.includes('semeru') || l.includes('ibm')) return 'IBM Semeru'
  if (l.includes('openjdk')) return 'OpenJDK'
  if (l.includes('java(tm)') || l.includes('java(tm) se')) return 'Oracle'
  return undefined
}

async function probeJava(exePath: string): Promise<JavaInstall | null> {
  try {
    const { stderr } = await execFileAsync(exePath, ['-version'], { timeout: 4000 })
    const firstLine = stderr.trim().split('\n')[0] ?? ''
    const versionMatch = firstLine.match(/"([^"]+)"/)
    if (!versionMatch) return null

    const version = versionMatch[1]
    // Java 8 reports as "1.8.x", Java 11+ reports major directly
    const major = version.startsWith('1.')
      ? parseInt(version.split('.')[1] ?? '8', 10)
      : parseInt(version.split('.')[0] ?? '8', 10)

    return { path: exePath, version, major, vendor: parseVendor(stderr) }
  } catch {
    return null
  }
}

export async function detectAllJavas(): Promise<JavaInstall[]> {
  const seen = new Set<string>()
  const results: JavaInstall[] = []

  const add = async (path: string): Promise<void> => {
    const key = path.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const info = await probeJava(path)
    if (info) results.push(info)
  }

  // 1. Whatever is on PATH
  await add('java')

  // 2. Common install directories
  for (const root of SCAN_ROOTS) {
    if (!existsSync(root)) continue
    try {
      const subdirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())
      for (const sub of subdirs) {
        const exe = join(root, sub.name, 'bin', 'java.exe')
        if (existsSync(exe)) await add(exe)
      }
    } catch {
      // Unreadable directory — skip
    }
  }

  return results.sort((a, b) => b.major - a.major)
}
