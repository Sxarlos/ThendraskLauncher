/**
 * Strips Electron's "Error invoking remote method 'x:y': Error: " prefix
 * and translates known internal error codes to user-facing messages.
 */
export function ipcError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  // Remove Electron's IPC wrapper
  const msg = raw.replace(/^Error invoking remote method '[^']+': Error: /, '')

  // SESSION_EXPIRED:username — session expired...
  if (msg.startsWith('SESSION_EXPIRED:')) {
    const username = msg.split(':')[1]?.split(' ')[0] ?? 'your account'
    return `Session expired for "${username}". Go to Accounts → remove the account → sign in again.`
  }

  return msg
}
