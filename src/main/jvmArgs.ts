/**
 * Parse a user-entered JVM argument string while preserving quoted values and
 * Windows paths. Quotes group text but are not passed to Java themselves.
 */
export function parseJvmArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false

  const push = (): void => {
    if (!started) return
    args.push(current)
    current = ''
    started = false
  }

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (quote) {
      if (char === quote) {
        quote = null
      } else if (char === '\\' && input[i + 1] === quote) {
        current += quote
        started = true
        i++
      } else {
        current += char
        started = true
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      push()
    } else if (char === '\\' && /[\s'"]/.test(input[i + 1] ?? '')) {
      current += input[++i]
      started = true
    } else {
      current += char
      started = true
    }
  }

  if (quote) throw new Error('Unclosed quote in extra JVM arguments.')
  push()
  return args
}
