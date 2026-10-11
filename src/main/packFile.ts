import { createHash, randomUUID } from 'crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'

/** Keep a verified cache hit, otherwise replace only after a mirror passes verification. */
export async function ensurePackFile(destination: string, urls: string[], hashes?: Record<string, string>): Promise<void> {
  const algorithm = hashes?.sha512 ? 'sha512' : hashes?.sha1 ? 'sha1' : undefined
  const matches = (bytes: Buffer): boolean => !algorithm || createHash(algorithm).update(bytes).digest('hex') === hashes![algorithm].toLowerCase()
  if (algorithm && existsSync(destination) && matches(readFileSync(destination))) return
  const temp = `${destination}.${randomUUID()}.part`
  try {
    for (const url of urls) {
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'thendrask-launcher' } })
        if (!response.ok) continue
        const bytes = Buffer.from(await response.arrayBuffer())
        if (!matches(bytes)) continue
        writeFileSync(temp, bytes)
        renameSync(temp, destination)
        return
      } catch { /* Try the next mirror, preserving the original file. */ }
    }
    throw new Error(`Failed to download a verified required file: ${destination}`)
  } finally {
    rmSync(temp, { force: true })
  }
}
