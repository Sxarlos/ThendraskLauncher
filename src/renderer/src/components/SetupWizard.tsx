import { useEffect, useState } from 'react'
import type { Account, AppSettings } from '@shared/types'
import { CURSEFORGE_ENABLED } from '../../../shared/features'
import { useApp } from '../store'

/* ── Step type ───────────────────────────────────────────── */

type Step = 'welcome' | 'account' | 'curseforge' | 'friends' | 'performance' | 'features' | 'done'
const STEP_ORDER: Step[] = [
  'welcome',
  'account',
  ...(CURSEFORGE_ENABLED ? ['curseforge' as const] : []),
  'friends',
  'performance',
  'features',
  'done'
]
const PROGRESS_STEPS: Step[] = STEP_ORDER.filter((step) => step !== 'welcome')

/* ── Step indicator ──────────────────────────────────────── */

function StepDots({ current }: { current: Step }): JSX.Element {
  const idx = PROGRESS_STEPS.indexOf(current)
  if (idx === -1) return <></>
  return (
    <div className="flex gap-2 justify-center mb-8">
      {PROGRESS_STEPS.map((s, i) => (
        <div
          key={s}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === idx ? 20 : 6,
            height: 6,
            background: i <= idx ? 'var(--accent-strong)' : 'var(--surface-3)',
          }}
        />
      ))}
    </div>
  )
}

/* ── Step: Welcome ───────────────────────────────────────── */

function WelcomeStep({ onNext }: { onNext: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      {/* Logo area */}
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
        style={{
          background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(var(--accent-rgb),0.05))',
          border: '1px solid rgba(var(--accent-rgb),0.2)',
          boxShadow: '0 0 48px rgba(var(--accent-rgb),0.15)',
        }}
      >
        ⛏️
      </div>

      <div>
        <h1 className="text-2xl font-black text-white mb-2">Welcome to Thendrask Launcher</h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)', maxWidth: 340 }}>
          Let's get you set up in a couple of quick steps.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full">
        <button
          onClick={onNext}
          className="w-full py-3 rounded-xl font-bold text-sm text-black transition-all"
          style={{ background: 'var(--accent-strong)', boxShadow: '0 0 28px rgba(var(--accent-rgb),0.4)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-strong)')}
        >
          Get Started
        </button>
      </div>
    </div>
  )
}

/* ── Step: Microsoft Account ─────────────────────────────── */

function AccountStep({ onNext }: { onNext: () => void }): JSX.Element {
  const accounts = useApp((s) => s.accounts)
  const refreshAccounts = useApp((s) => s.refreshAccounts)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeAcc: Account | undefined = accounts.find((a) => a.active) ?? accounts[0]
  const isSignedIn = !!activeAcc

  const handleLogin = async (): Promise<void> => {
    setSigning(true)
    setError(null)
    try {
      await window.api.accounts.login()
      await refreshAccounts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setSigning(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <StepDots current="account" />

      <div className="text-center">
        <h2 className="text-xl font-black text-white mb-1.5">Sign in to Minecraft</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          You'll need a Microsoft account linked to Minecraft Java Edition.
        </p>
      </div>

      {isSignedIn ? (
        /* Already signed in */
        <div
          className="flex items-center gap-3 rounded-xl p-4"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
        >
          <div
            className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-sm"
            style={{ background: 'var(--surface-3)', color: 'var(--text-soft)' }}
          >
            {activeAcc.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-white truncate">{activeAcc.username}</div>
            <div className="text-xs" style={{ color: 'var(--accent)' }}>Signed in ✓</div>
          </div>
        </div>
      ) : (
        /* Not signed in */
        <div className="flex flex-col gap-3">
          <div
            className="rounded-xl p-4 text-sm leading-relaxed"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}
          >
            Clicking the button below will open a Microsoft login window in your browser. Sign in with the account that owns Minecraft Java Edition.
          </div>

          {error && (
            <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={signing}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            style={{ background: 'rgba(var(--overlay-rgb),0.08)', color: 'var(--text-strong)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => { if (!signing) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--overlay-rgb),0.08)' }}
          >
            {/* Microsoft logo */}
            <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            {signing ? 'Opening browser…' : 'Sign in with Microsoft'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={onNext}
          disabled={!isSignedIn && !signing}
          className="w-full py-3 rounded-xl font-bold text-sm text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent-strong)' }}
          onMouseEnter={(e) => { if (isSignedIn) e.currentTarget.style.background = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
          title={!isSignedIn ? 'Sign in first to continue' : ''}
        >
          Continue
        </button>
        {!isSignedIn && (
          <button
            onClick={onNext}
            className="text-xs py-2 transition-colors"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
          >
            I'll sign in later →
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Step: CurseForge API Key ────────────────────────────── */

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

function CurseForgeStep({ onNext }: { onNext: () => void }): JSX.Element {
  const [testState, setTestState] = useState<TestState>('idle')
  const [error, setError] = useState<string | null>(null)

  const testKey = async (): Promise<void> => {
    setTestState('testing')
    setError(null)
    try {
      await window.api.browse.curseforge({ limit: 1 })
      setTestState('ok')
    } catch (e) {
      setTestState('fail')
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Connection failed: ${msg}`)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <StepDots current="curseforge" />

      <div className="text-center">
        <h2 className="text-xl font-black text-white mb-1.5">CurseForge Access</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          CurseForge access is securely provided by the Thendrask relay.
        </p>
      </div>

      {/* Instructions card */}
      <div
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}
      >
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          You do not need to create or enter an API key. The launcher asks the relay for CurseForge data, and the relay keeps the project key private.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {testState !== 'ok' && (
          <button
            onClick={testKey}
            disabled={testState === 'testing'}
            className="w-full py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}
            onMouseEnter={(e) => { if (testState !== 'testing') e.currentTarget.style.background = 'var(--surface-3)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
          >
            {testState === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
        )}

        {testState === 'ok' && (
          <p className="text-xs text-center font-medium" style={{ color: 'var(--accent)' }}>
            ✓ Connected to CurseForge
          </p>
        )}
        {error && (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--danger)' }}>{error}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={onNext}
          className="w-full py-3 rounded-xl font-bold text-sm text-black transition-all"
          style={{ background: 'var(--accent-strong)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

/* ── Step: Friends ───────────────────────────────────────── */

function FriendsStep({ onNext }: { onNext: () => void }): JSX.Element {
  const [hasRelay, setHasRelay] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.settings.get().then((s) => setHasRelay(!!s.relayUrl)).catch(() => setHasRelay(false))
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <StepDots current="friends" />

      <div className="text-center">
        <h2 className="text-xl font-black text-white mb-1.5">Friends</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          See when your mates are online and what they're playing - right inside the launcher.
        </p>
      </div>

      {/* Feature highlights */}
      <div
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}
      >
        {([
          ['👥', 'Add friends by code', 'No IP addresses - just share your unique friend code'],
          ['🟢', 'Live status', 'See who\'s online, what modpack they\'re playing, and for how long'],
          ['🌐', 'Works anywhere', 'Friends on different networks, different countries - it all works'],
        ] as [string, string, string][]).map(([icon, title, desc]) => (
          <div key={title} className="flex items-start gap-3">
            <span className="text-lg shrink-0">{icon}</span>
            <div>
              <div className="text-sm font-semibold text-white">{title}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {hasRelay === true && (
        <div
          className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(var(--accent-rgb),0.06)', border: '1px solid rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All set - head to the Friends tab to add your first friend.
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={onNext}
          className="w-full py-3 rounded-xl font-bold text-sm text-black transition-all"
          style={{ background: 'var(--accent-strong)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-strong)')}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

/* ── Step: Performance ───────────────────────────────────── */

type PerfChoice = 'full' | 'lite'

function PerformanceStep({ onNext }: { onNext: () => void }): JSX.Element {
  const setLiteMode = useApp((s) => s.setLiteMode)
  const [choice, setChoice] = useState<PerfChoice>('full')
  const [saving, setSaving] = useState(false)

  const handleContinue = async (): Promise<void> => {
    setSaving(true)
    try {
      const patch: Partial<AppSettings> = { liteMode: choice === 'lite' }
      if (choice === 'lite') {
        // Never clobber render/graphics settings the user already configured.
        const current = await window.api.settings.get()
        if (current.defaultGameSettings === undefined) {
          patch.defaultGameSettings = { renderDistance: 8, graphics: 'fast', particles: 'minimal' }
        }
      }
      await window.api.settings.set(patch)
      setLiteMode(choice === 'lite')
    } finally {
      setSaving(false)
      onNext()
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <StepDots current="performance" />

      <div className="text-center">
        <h2 className="text-xl font-black text-white mb-1.5">Optimise for your PC</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Choose how much visual polish the launcher itself uses. You can change this anytime in Settings.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {([
          ['full', 'Full experience', 'Smooth animations, blur effects, and the 3D skin viewer.'],
          ['lite', 'Lite mode - for lower-end PCs', 'Saves RAM by disabling effects and the 3D skin viewer.'],
        ] as [PerfChoice, string, string][]).map(([id, title, desc]) => {
          const active = choice === id
          return (
            <button
              key={id}
              onClick={() => setChoice(id)}
              className="text-left rounded-xl p-4 transition-all"
              style={{
                background: active ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface-2)',
                border: `1.5px solid ${active ? 'rgba(var(--accent-rgb),0.4)' : 'var(--border-soft)'}`,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm" style={{ color: active ? 'var(--accent)' : 'var(--text-strong)' }}>
                  {title}
                </div>
                {active && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent-strong)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{desc}</div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={handleContinue}
          disabled={saving}
          className="w-full py-3 rounded-xl font-bold text-sm text-black transition-all disabled:opacity-60"
          style={{ background: 'var(--accent-strong)' }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = 'var(--accent)' }}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-strong)')}
        >
          {saving ? 'Saving…' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}

/* ── Step: Optional features ────────────────────────────── */

function FeaturesStep({ onNext }: { onNext: () => void }): JSX.Element {
  const setGregTechHubEnabled = useApp((state) => state.setGregTechHubEnabled)
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleContinue = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.settings.set({ gregTechHubEnabled: enabled })
      setGregTechHubEnabled(enabled)
      onNext()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <StepDots current="features" />
      <div className="text-center">
        <h2 className="text-xl font-black text-white mb-1.5">Optional community features</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Choose whether specialist modding tools appear in your launcher. This can be changed later in Settings.
        </p>
      </div>

      <button
        onClick={() => setEnabled(!enabled)}
        className="text-left rounded-xl p-4 transition-all"
        style={{
          background: enabled ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface-2)',
          border: `1.5px solid ${enabled ? 'rgba(var(--accent-rgb),0.4)' : 'var(--border-soft)'}`
        }}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg" style={{ background: 'rgba(var(--accent-rgb),0.10)', color: 'var(--accent)' }}>⚙</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-sm" style={{ color: enabled ? 'var(--accent)' : 'var(--text-strong)' }}>Enable GregTech Hub</div>
              <div className="w-9 h-5 rounded-full p-0.5 transition-colors" style={{ background: enabled ? 'var(--accent-strong)' : 'var(--surface-3)' }}>
                <div className="w-4 h-4 rounded-full transition-transform" style={{ background: enabled ? '#000' : 'var(--text-muted)', transform: enabled ? 'translateX(16px)' : 'translateX(0)' }} />
              </div>
            </div>
            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Adds a sidebar tab for version-checked GTNH community addons from official GitHub releases. Disabled by default.
            </p>
          </div>
        </div>
      </button>

      <button
        onClick={() => void handleContinue()}
        disabled={saving}
        className="w-full py-3 rounded-xl font-bold text-sm text-black transition-all disabled:opacity-60"
        style={{ background: 'var(--accent-strong)' }}
      >
        {saving ? 'Saving…' : 'Continue →'}
      </button>
    </div>
  )
}

/* ── Step: Done ──────────────────────────────────────────── */

function DoneStep({ accounts, onFinish }: { accounts: Account[]; onFinish: () => void }): JSX.Element {
  const activeAcc = accounts.find((a) => a.active) ?? accounts[0]

  return (
    <div className="flex flex-col items-center text-center gap-6">
      <StepDots current="done" />

      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
        style={{
          background: 'rgba(var(--accent-rgb),0.12)',
          border: '1px solid rgba(var(--accent-rgb),0.25)',
          boxShadow: '0 0 32px rgba(var(--accent-rgb),0.2)',
        }}
      >
        🎮
      </div>

      <div>
        <h2 className="text-xl font-black text-white mb-2">You're all set!</h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)', maxWidth: 320 }}>
          {activeAcc
            ? <>Signed in as <span className="font-semibold text-white">{activeAcc.username}</span>. Browse modpacks or create a vanilla instance to get started.</>
            : <>Head to the Library to browse modpacks or create a vanilla instance to get started.</>}
        </p>
      </div>

      <button
        onClick={onFinish}
        className="w-full py-3 rounded-xl font-bold text-sm text-black transition-all"
        style={{ background: 'var(--accent-strong)', boxShadow: '0 0 28px rgba(var(--accent-rgb),0.4)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-strong)')}
      >
        Launch Thendrask Launcher →
      </button>
    </div>
  )
}

/* ── Main wizard ─────────────────────────────────────────── */

export default function SetupWizard({ onComplete }: { onComplete: () => void }): JSX.Element {
  const accounts = useApp((s) => s.accounts)
  const [step, setStep] = useState<Step>('welcome')

  const next = (): void => {
    const idx = STEP_ORDER.indexOf(step)
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1])
  }

  const finish = async (): Promise<void> => {
    await window.api.settings.set({ setupComplete: true })
    onComplete()
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(10,12,16,0.88)', backdropFilter: 'blur(12px)', zIndex: 9999 }}
    >
      {/* Card */}
      <div
        className="relative w-full rounded-3xl overflow-hidden"
        style={{
          maxWidth: 460,
          background: 'var(--surface)',
          border: '1px solid var(--border-soft)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--overlay-rgb),0.04)',
          padding: '36px 40px',
        }}
      >
        {/* Subtle accent glow at top */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5 rounded-t-3xl"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.5), transparent)' }}
        />

        {step === 'welcome'    && <WelcomeStep onNext={next} />}
        {step === 'account'    && <AccountStep onNext={next} />}
        {CURSEFORGE_ENABLED && step === 'curseforge' && <CurseForgeStep onNext={next} />}
        {step === 'friends'    && <FriendsStep onNext={next} />}
        {step === 'performance' && <PerformanceStep onNext={next} />}
        {step === 'features'   && <FeaturesStep onNext={next} />}
        {step === 'done'       && <DoneStep accounts={accounts} onFinish={finish} />}
      </div>
    </div>
  )
}
