import { useEffect, useState } from 'react'
import type { Account } from '@shared/types'
import { useApp } from '../store'

/* ── Step type ───────────────────────────────────────────── */

type Step = 'welcome' | 'account' | 'curseforge' | 'friends' | 'done'
const STEP_ORDER: Step[] = ['welcome', 'account', 'curseforge', 'friends', 'done']
const PROGRESS_STEPS: Step[] = ['account', 'curseforge', 'friends', 'done']

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
          Let's get you set up in a couple of quick steps - signing in and optionally connecting CurseForge.
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
  const [key, setKey] = useState('')
  const [keyLoaded, setKeyLoaded] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [error, setError] = useState<string | null>(null)

  // Pre-load saved key so users can see/verify what's already stored
  useEffect(() => {
    window.api.settings.get().then((s) => {
      setKey(s.curseforgeApiKey ?? '')
      setKeyLoaded(true)
    }).catch(() => setKeyLoaded(true))
  }, [])

  const trimmed = key.trim()

  const saveAndContinue = async (): Promise<void> => {
    if (!trimmed) { onNext(); return }
    setBusy(true)
    setError(null)
    try {
      await window.api.settings.set({ curseforgeApiKey: trimmed })
      onNext()
    } catch {
      setError('Failed to save key - try again')
    } finally {
      setBusy(false)
    }
  }

  const testKey = async (): Promise<void> => {
    if (!trimmed) return
    setTestState('testing')
    setError(null)
    try {
      // Save first, then trigger a lightweight search to confirm the key works
      await window.api.settings.set({ curseforgeApiKey: trimmed })
      await window.api.browse.curseforge({ limit: 1 })
      setTestState('ok')
    } catch (e) {
      setTestState('fail')
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('403') || msg.includes('401')) {
        setError('Key rejected by CurseForge - make sure you copied the full key from the API Keys section of the console.')
      } else {
        setError(`Test failed: ${msg}`)
      }
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <StepDots current="curseforge" />

      <div className="text-center">
        <h2 className="text-xl font-black text-white mb-1.5">CurseForge Access</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Optional - required to browse &amp; install CurseForge modpacks.
        </p>
      </div>

      {/* Instructions card */}
      <div
        className="rounded-xl p-4 flex flex-col gap-3"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>How to get your API key</p>
        {([
          ['1', 'Open the CurseForge console (button below)'],
          ['2', 'Sign in or create a free account'],
          ['3', 'Click "API Keys" in the left sidebar'],
          ['4', 'Copy the key - it starts with $2a$10$'],
        ] as [string, string][]).map(([n, text]) => (
          <div key={n} className="flex items-start gap-3">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
              style={{ background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}
            >
              {n}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{text}</span>
          </div>
        ))}

        <button
          onClick={() => window.open('https://console.curseforge.com/', '_blank')}
          className="mt-1 w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-all"
          style={{ background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.2)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.08)' }}
        >
          Open CurseForge Console
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
      </div>

      {/* Key input */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => { setKey(e.target.value); setTestState('idle'); setError(null) }}
            placeholder={keyLoaded ? 'Paste your API key here…' : 'Loading…'}
            disabled={!keyLoaded}
            className="flex-1 rounded-xl px-3 py-2.5 text-sm font-mono outline-none disabled:opacity-50"
            style={{
              background: 'var(--surface-2)',
              border: `1px solid ${testState === 'ok' ? 'rgba(var(--accent-rgb),0.4)' : testState === 'fail' ? 'rgba(var(--danger-rgb),0.4)' : 'var(--border-soft)'}`,
              color: 'var(--text-strong)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb),0.5)')}
            onBlur={(e) => (e.currentTarget.style.borderColor =
              testState === 'ok' ? 'rgba(var(--accent-rgb),0.4)' :
              testState === 'fail' ? 'rgba(var(--danger-rgb),0.4)' : 'var(--border-soft)')}
          />
          {/* Show/hide toggle */}
          <button
            onClick={() => setShowKey((s) => !s)}
            className="px-3 rounded-xl text-sm transition-colors"
            style={{ background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border-soft)' }}
            title={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>

        {/* Test button */}
        {trimmed && testState !== 'ok' && (
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
        {testState === 'fail' && (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            Tip: new CurseForge API keys can take a few minutes to activate after creation. If you just made your key, wait 2–3 minutes then try again.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={saveAndContinue}
          disabled={busy}
          className="w-full py-3 rounded-xl font-bold text-sm text-black transition-all disabled:opacity-60"
          style={{ background: 'var(--accent-strong)' }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-strong)' }}
        >
          {trimmed ? 'Save & Continue' : 'Skip for now →'}
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
        {step === 'curseforge' && <CurseForgeStep onNext={next} />}
        {step === 'friends'    && <FriendsStep onNext={next} />}
        {step === 'done'       && <DoneStep accounts={accounts} onFinish={finish} />}
      </div>
    </div>
  )
}
