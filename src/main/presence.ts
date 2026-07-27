import { net, app } from 'electron'
import { runningInstanceIds } from './launcher'
import { getInstance } from './instances'
import { listAccounts } from './accounts'
import { getSettings } from './settings'

let registrationTimer: ReturnType<typeof setTimeout> | null = null
let _idle = false
let _registered = false
let _playingInstanceId: string | null = null
let _playingSince: number | null = null
let pushInFlight: Promise<void> | null = null

// Push every 30s while active; back off to 60s while idle, still comfortably
// under the relay's 90s offline TTL, but roughly halves idle background traffic.
const ACTIVE_INTERVAL_MS = 30_000
const IDLE_INTERVAL_MS = 60_000
const REQUEST_TIMEOUT_MS = 10_000

/** (Re)arms the self-rescheduling push timer at the cadence matching the current idle state. */
function armTimer(): void {
  if (registrationTimer) clearTimeout(registrationTimer)
  if (!_registered) return
  registrationTimer = setTimeout(() => {
    void pushPresence().finally(armTimer)
  }, _idle ? IDLE_INTERVAL_MS : ACTIVE_INTERVAL_MS)
}

function ownStatus(): object {
  const active = listAccounts().find((a) => a.active)
  const runningId = runningInstanceIds()[0]
  const inst = runningId ? getInstance(runningId) : null
  if ((runningId ?? null) !== _playingInstanceId) {
    _playingInstanceId = runningId ?? null
    _playingSince = runningId ? Date.now() : null
  }

  return {
    username: active?.username ?? 'Unknown',
    idle: _idle,
    playing: inst?.name ?? null,
    mcVersion: inst?.mcVersion ?? null,
    loader: inst?.loader ?? null,
    since: inst ? _playingSince : null,
    appVersion: app.getVersion(),
  }
}

export function setIdleState(idle: boolean): void {
  _idle = idle
  void pushPresence()
  armTimer() // re-arm at the new cadence, restarting the countdown from now
}

async function performPresencePush(): Promise<void> {
  const { relayUrl, friendCode, presenceSecret } = getSettings()
  if (!relayUrl || !friendCode || !presenceSecret) return
  const code = friendCode.replace(/-/g, '')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await net.fetch(`${relayUrl}/presence/${code}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${presenceSecret}`
      },
      body: JSON.stringify(ownStatus()),
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`Presence relay returned HTTP ${response.status}`)
  } catch (err) {
    console.error('[relay]', (err as Error).message)
  } finally {
    clearTimeout(timeout)
  }
}

function pushPresence(): Promise<void> {
  if (pushInFlight) return pushInFlight
  pushInFlight = performPresencePush().finally(() => {
    pushInFlight = null
  })
  return pushInFlight
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
