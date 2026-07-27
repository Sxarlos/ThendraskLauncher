import type AdmZip from 'adm-zip'

export interface ArchiveSafetyLimits {
  maxEntries: number
  maxExpandedBytes: number
  maxEntryBytes: number
  maxCompressionRatio: number
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveSafetyLimits = {
  maxEntries: 100_000,
  maxExpandedBytes: 20 * 1024 * 1024 * 1024,
  maxEntryBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 1_000
}

export function validateArchiveEntries(
  entries: AdmZip.IZipEntry[],
  label = 'Archive',
  limits: ArchiveSafetyLimits = DEFAULT_ARCHIVE_LIMITS
): void {
  if (entries.length > limits.maxEntries) {
    throw new Error(`${label} contains too many files to import safely.`)
  }

  let expandedBytes = 0
  for (const entry of entries) {
    const size = Number(entry.header.size ?? 0)
    const compressedSize = Number(entry.header.compressedSize ?? 0)
    if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(compressedSize) || compressedSize < 0) {
      throw new Error(`${label} contains an invalid entry: ${entry.entryName}`)
    }
    expandedBytes += size
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.maxExpandedBytes) {
      throw new Error(`${label} is too large to import safely.`)
    }
    if (size > limits.maxEntryBytes) {
      throw new Error(`${label} entry is too large: ${entry.entryName}`)
    }
    if (compressedSize > 0 && size / compressedSize > limits.maxCompressionRatio) {
      throw new Error(`${label} entry has an unsafe compression ratio: ${entry.entryName}`)
    }
  }
}
