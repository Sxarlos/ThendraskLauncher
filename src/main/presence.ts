import { net, app } from 'electron'
import { runningInstanceIds } from './launcher'
import { getInstance } from './instances'
import { listAccounts } from './accounts'
import { getSettings } from './settings'

let registrationTimer: ReturnType<typeof setInterval> | null = null

function ownStatus(): object {
  const active = listAccounts().find((a) => a.active)
  const runningId = runningInstanceIds()[0]
  const inst = runningId ? getInstance(runningId) : null

  return {
    username: active?.username ?? 'Unknown',
    playing: inst?.name ?? null,
    mcVersion: inst?.mcVersion ?? null,
    loader: inst?.loader ?? null,
    since: inst ? Date.now() : null,
    appVersion: app.getVersion(),
  }
}

async function pushPresence(): Promise<void> {
  const { relayUrl, friendCode } = getSettings()
  if (!relayUrl || !friendCode) return
  const code = friendCode.replace(/-/g, '')
  try {
    await net.fetch(`${relayUrl}/presence/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ownStatus()),
    })
  } catch (err) {
    console.error('[relay]', (err as Error).message)
  }
}

export function startRelayRegistration(): void {
  if (registrationTimer) return
  void pushPresence()
  registrationTimer = setInterval(() => void pushPresence(), 30_000)
}

export function stopRelayRegistration(): void {
  if (registrationTimer) {
    clearInterval(registrationTimer)
    registrationTimer = null
  }
}

export function getOwnPresence(): object {
  return ownStatus()
}
