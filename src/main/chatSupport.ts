/**
 * Chat signing/reporting restrictions relevant to No Chat Restrictions began
 * with Java 1.19.1. Known older releases should never receive the patch.
 * Unknown/future version formats remain eligible so their exact compatibility
 * can still be decided by the Modrinth version lookup.
 */
export function requiresChatPatch(mcVersion: string): boolean {
  const release = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/)
  if (!release) return true

  const minor = parseInt(release[1], 10)
  const patch = parseInt(release[2] ?? '0', 10)
  return minor > 19 || (minor === 19 && patch >= 1)
}
