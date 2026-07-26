export function progressLabel(state?: string): string {
  switch (state) {
    case 'preparing':  return 'Preparing…'
    case 'downloading': return 'Downloading…'
    case 'launching':  return 'Launching…'
    case 'running':    return 'Running'
    case 'error':      return 'Error'
    default:           return ''
  }
}
