import { net, app } from 'electron'
import { runningInstanceIds } from './launcher'
import { getInstance } from './instances'
import { listAccounts } from './accounts'
import { getSettings } from './settings'

let registrationTimer: ReturnType<typeof setTimeout> | null = null
let _idle = false
let _registered = false

// Push every 30s while active; back off to 60s while idle — still comfortably
// under the relay's 90s offline TTL, but roughly halves idle background traffic.
const ACTIVE_INTERVAL_MS = 30_000
const IDLE_INTERVAL_MS = 60_000

/** (Re)arms the self-rescheduling push timer at the cadence matching the current idle state. */
function armTimer(): void {
  if (registrationTimer) clearTimeout(registrationTimer)
  if (!_registered) return
  registrationTimer = setTimeout(() => {
    void pushPresence()
    armTimer()
  }, _idle ? IDLE_INTERVAL_MS : ACTIVE_INTERVAL_MS)
}

function ownStatus(): object {
  const active = listAccounts().find((a) => a.active)
  const runningId = runningInstanceIds()[0]
  const inst = runningId ? getInstance(runningId) : null

  return {
    username: active?.username ?? 'Unknown',
    idle: _idle,
    playing: inst?.name ?? null,
    mcVersion: inst?.mcVersion ?? null,
    loader: inst?.loader ?? null,
    since: inst ? Date.now() : null,
    appVersion: app.getVersion(),
  }
}

export function setIdleState(idle: boolean): void {
  _idle = idle
  void pushPresence()
  armTimer() // re-arm at the new cadence, restarting the countdown from now
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
  if (_registered) return
  _registered = true
  void pushPresence()
  armTimer()
}

export function stopRelayRegistration(): void {
  _registered = false
  if (registrationTimer) {
    clearTimeout(registrationTimer)
    registrationTimer = null
  }
}

export function getOwnPresence(): object {
  return ownStatus()
}
