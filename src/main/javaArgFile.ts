// CreateProcess itself allows 32,767 characters, but Windows launch paths
// involving libuv/Electron can fail much earlier. Stay below cmd.exe's 8,191
// character boundary as well so every supported Windows path is safe.
const WINDOWS_SAFE_COMMAND_LENGTH = 7_000

/** Windows CreateProcess has a 32,767-character command-line limit. */
export function needsJavaArgFile(javaPath: string, args: string[], platform = process.platform): boolean {
  if (platform !== 'win32') return false
  const estimatedLength = javaPath.length + 1 + args.reduce((total, arg) => total + arg.length + 3, 0)
  return estimatedLength >= WINDOWS_SAFE_COMMAND_LENGTH
}

/**
 * Java 9+ argument files accept one quoted argument per line. JSON string
 * escaping is compatible with the launcher's quoted argument-file grammar.
 */
export function serializeJavaArgFile(args: string[]): string {
  return `${args.map((arg) => JSON.stringify(arg)).join('\n')}\n`
}
