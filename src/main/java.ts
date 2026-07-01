import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import AdmZip from 'adm-zip'
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

  // 3. Managed JREs downloaded by Ender Launcher
  try {
    const managedRoot = join(app.getPath('userData'), 'java')
    if (existsSync(managedRoot)) {
      for (const major of readdirSync(managedRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
        const exe = findJavaExeInDir(join(managedRoot, major))
        if (exe) await add(exe)
      }
    }
  } catch { /* non-fatal */ }

  return results.sort((a, b) => b.major - a.major)
}

/** Returns the required Java major version for a given Minecraft version string. */
export function requiredJavaMajor(mcVersion: string): number {
  const m = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?$/)
  const minor = parseInt(m?.[1] ?? '8', 10)
  const patch = parseInt(m?.[2] ?? '0', 10)
  if (minor > 20 || (minor === 20 && patch >= 5)) return 21
  if (minor >= 17) return 17
  return 8
}

/**
 * Inspects the bootstraplauncher library installed by NeoForge and returns
 * the Java major version required to run it. Returns null if not installed yet.
 * bootstraplauncher 2.x requires Java 21; 1.x requires Java 17.
 */
export function detectNeoforgeJavaMajor(gameDir: string): number | null {
  const libBase = join(gameDir, 'libraries', 'cpw', 'mods', 'bootstraplauncher')
  if (!existsSync(libBase)) return null
  try {
    for (const entry of readdirSync(libBase, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const majorVer = parseInt(entry.name.split('.')[0] ?? '1', 10)
      if (majorVer >= 2) return 21
    }
  } catch { /* non-fatal */ }
  return 17
}

/** Find java(.exe) inside a directory that may contain a single top-level JRE folder. */
function findJavaExeInDir(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'

  const direct = join(dir, 'bin', exe)
  if (existsSync(direct)) return direct

  // Zip extracts to a subdirectory like "jdk-21.0.5+11-jre"
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const nested = join(dir, entry.name, 'bin', exe)
      if (existsSync(nested)) return nested
    }
  } catch { /* non-fatal */ }

  return undefined
}

async function fetchAdoptiumPackage(major: number): Promise<{ url: string; filename: string; isZip: boolean }> {
  const os = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jre&jvm_impl=hotspot&os=${os}&page=0&page_size=1&project=jre&vendor=eclipse`

  const res = await fetch(apiUrl)
  if (!res.ok) throw new Error(`Adoptium API returned ${res.status}`)

  const data = (await res.json()) as any[]
  const pkg = data[0]?.binary?.package
  if (!pkg?.link) throw new Error(`No JRE package found for Java ${major} (${os}/${arch})`)

  return {
    url: pkg.link as string,
    filename: pkg.name as string,
    isZip: (pkg.name as string).endsWith('.zip')
  }
}

/**
 * Ensure a Java executable of at least `requiredMajor` is available.
 *
 * Priority order:
 *   1. `overridePath` (user's configured path in settings) — used as-is, error if invalid
 *   2. Any installed system Java that meets the version requirement
 *   3. A previously auto-downloaded JRE in userData/java/{major}/
 *   4. Auto-download Temurin JRE from Adoptium and extract to userData/java/{major}/
 *
 * Returns the absolute path to the java executable.
 */
export async function ensureJava(
  requiredMajor: number,
  overridePath: string | undefined,
  onProgress: (msg: string, pct?: number) => void
): Promise<string> {
  // 1. User-configured path — use it only if it meets the version requirement
  if (overridePath) {
    const info = await probeJava(overridePath)
    if (!info) throw new Error(`Java not found at configured path: ${overridePath}`)
    if (info.major >= requiredMajor) return overridePath
    // configured Java is too old for this launch; fall through to auto-detect
  }

  // 2. Check system-installed Java
  const allJavas = await detectAllJavas()
  const suitable = allJavas.find((j) => j.major >= requiredMajor)
  if (suitable) return suitable.path

  // 3. Check previously auto-installed JRE
  const managedDir = join(app.getPath('userData'), 'java', String(requiredMajor))
  const cachedExe = findJavaExeInDir(managedDir)
  if (cachedExe) return cachedExe

  // 4. Auto-download from Eclipse Adoptium (Temurin)
  onProgress(`Java ${requiredMajor} not found — downloading automatically…`, 0)

  const pkg = await fetchAdoptiumPackage(requiredMajor)

  const cacheDir = join(app.getPath('userData'), 'java-cache')
  mkdirSync(cacheDir, { recursive: true })
  const archivePath = join(cacheDir, pkg.filename)

  // Download (skip if archive already cached from a previous failed extraction)
  if (!existsSync(archivePath)) {
    const res = await fetch(pkg.url)
    if (!res.ok) throw new Error(`Java download failed: ${res.status}`)

    const total = parseInt(res.headers.get('content-length') ?? '0', 10)
    const chunks: Uint8Array[] = []
    let downloaded = 0

    if (res.body) {
      const reader = (res.body as ReadableStream<Uint8Array>).getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          downloaded += value.length
          if (total > 0) {
            const mb = (downloaded / 1024 / 1024).toFixed(1)
            const totalMb = (total / 1024 / 1024).toFixed(1)
            onProgress(
              `Downloading Java ${requiredMajor}… (${mb} / ${totalMb} MB)`,
              Math.round((downloaded / total) * 75)
            )
          }
        }
      }
    } else {
      onProgress(`Downloading Java ${requiredMajor}…`, 20)
      chunks.push(new Uint8Array(await res.arrayBuffer()))
    }

    writeFileSync(archivePath, Buffer.concat(chunks.map((c) => Buffer.from(c))))
  }

  // Extract
  onProgress(`Installing Java ${requiredMajor}…`, 80)
  mkdirSync(managedDir, { recursive: true })

  if (pkg.isZip) {
    const zip = new AdmZip(archivePath)
    zip.extractAllTo(managedDir, true)
  } else {
    // .tar.gz on macOS / Linux
    await execFileAsync('tar', ['-xzf', archivePath, '-C', managedDir])
  }

  onProgress(`Finalising Java ${requiredMajor}…`, 95)

  const javaExe = findJavaExeInDir(managedDir)
  if (!javaExe) throw new Error(`Java ${requiredMajor} installation failed — executable not found after extraction`)

  return javaExe
}
