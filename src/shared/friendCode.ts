const VALID_RE = /^[0-9A-Z]{10}$/

/** Strip dashes/spaces and uppercase. Returns the 10-char bare code, or null if invalid. */
export function normalizeFriendCode(raw: string): string | null {
  const clean = raw.replace(/[-\s]/g, '').toUpperCase()
  return VALID_RE.test(clean) ? clean : null
}

/** Format a bare 10-char code as XXXXX-XXXXX for display. */
export function formatFriendCode(bare: string): string {
  return `${bare.slice(0, 5)}-${bare.slice(5)}`
}
