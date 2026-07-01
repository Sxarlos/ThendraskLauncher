import { Client } from 'discord-rpc'

let rpc: Client | null = null
let connected = false
let activeClientId = ''

export function initDiscord(clientId: string | undefined, enabled: boolean): void {
  if (!enabled || !clientId?.trim()) {
    destroyDiscord()
    return
  }

  // Already connected with the same ID — nothing to do
  if (clientId === activeClientId && connected) return

  destroyDiscord()

  activeClientId = clientId
  const client = new Client({ transport: 'ipc' })
  rpc = client

  client.on('ready', () => {
    connected = true
    setIdle()
  })

  // Fired when Discord closes while we're connected
  client.on('disconnected', () => {
    connected = false
    rpc = null
    activeClientId = ''
  })

  client.login({ clientId }).catch((err: Error) => {
    console.warn('[Discord RPC] Could not connect:', err.message)
    connected = false
    rpc = null
    activeClientId = ''
  })
}

export function destroyDiscord(): void {
  if (rpc) {
    try { rpc.destroy() } catch { /* ignore */ }
    rpc = null
  }
  connected = false
  activeClientId = ''
}

export function setPlaying(instanceName: string, loader?: string, mcVersion?: string): void {
  if (!rpc || !connected) return

  const parts = [
    loader && loader !== 'vanilla' ? loader.charAt(0).toUpperCase() + loader.slice(1) : null,
    mcVersion ? `MC ${mcVersion}` : null,
  ].filter(Boolean)

  rpc.setActivity({
    details: instanceName,
    state: parts.length > 0 ? parts.join(' · ') : 'Playing Minecraft',
    startTimestamp: new Date(),
    largeImageKey: 'logo',
    largeImageText: 'Ender Launcher',
    instance: false,
    buttons: [{ label: 'ender-client.xyz', url: 'https://ender-client.xyz' }],
  }).catch(() => { /* Discord may have disconnected */ })
}

export function setIdle(): void {
  if (!rpc || !connected) return

  rpc.setActivity({
    details: 'In Launcher',
    state: 'Browsing instances',
    largeImageKey: 'logo',
    largeImageText: 'Ender Launcher',
    instance: false,
    buttons: [{ label: 'ender-client.xyz', url: 'https://ender-client.xyz' }],
  }).catch(() => { /* Discord may have disconnected */ })
}
