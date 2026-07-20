import { useEffect, useState } from 'react'
import { useApp } from '../store'

/**
 * Bottom-right update toast, Discord/VS Code style:
 *   - "Checking for updates…" while the startup check runs
 *   - "You're up to date" / "Downloading vX.Y.Z…" for a moment, then fades
 *   - "Update ready. Restart to apply" persists until dismissed or clicked
 * Downloads themselves are silent; the sidebar carries the progress bar.
 */
export default function UpdateToast(): JSX.Element | null {
  const status          = useApp((s) => s.updateCheckStatus)
  const setStatus       = useApp((s) => s.setUpdateCheckStatus)
  const updateInfo      = useApp((s) => s.updateInfo)
  const updateDownload  = useApp((s) => s.updateDownload)
  const [readyDismissed, setReadyDismissed] = useState(false)

  // Transient states clear themselves after a beat.
  useEffect(() => {
    if (status !== 'up-to-date' && status !== 'found') return
    const t = setTimeout(() => setStatus('idle'), status === 'found' ? 4000 : 2500)
    return () => clearTimeout(t)
  }, [status, setStatus])

  const showReady = updateDownload.state === 'ready' && updateInfo && !readyDismissed
  if (!showReady && status === 'idle') return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs shadow-lg"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border-soft)',
        animation: 'toastIn 0.25s ease-out',
      }}
    >
      {showReady ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', flexShrink: 0 }}>
            <path d="M12 2v10m0 0l-3-3m3 3l3-3"/>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          </svg>
          <span style={{ color: 'var(--text-bright)' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>v{updateInfo!.version}</span> is ready
          </span>
          <button
            onClick={() => window.api.update.install('')}
            className="px-2.5 py-1 rounded-lg font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'var(--accent)', color: '#000', fontSize: 11 }}
          >
            Restart now
          </button>
          <button
            onClick={() => setReadyDismissed(true)}
            className="px-2 py-1 rounded-lg font-medium transition-colors hover:bg-white/10"
            style={{ color: 'var(--text-muted)', fontSize: 11 }}
            title="Applies automatically the next time you quit"
          >
            Later
          </button>
        </>
      ) : status === 'checking' ? (
        <>
          <span
            className="w-3 h-3 rounded-full border-2 shrink-0"
            style={{
              borderColor: 'rgba(var(--accent-rgb),0.25)',
              borderTopColor: 'var(--accent)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ color: 'var(--text-muted)' }}>Checking for updates…</span>
        </>
      ) : status === 'up-to-date' ? (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--accent)', flexShrink: 0 }}>
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ color: 'var(--text-muted)' }}>You&apos;re up to date</span>
        </>
      ) : (
        // 'found' means a silent download just started when auto-download is on;
        // with it off we only announce (the sidebar carries the Download button).
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', flexShrink: 0 }}>
            <path d="M12 2v10m0 0l-3-3m3 3l3-3"/>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>
          </svg>
          <span style={{ color: 'var(--text-muted)' }}>
            {updateDownload.state === 'downloading'
              ? `Downloading${updateInfo ? ` v${updateInfo.version}` : ' update'} in the background…`
              : `v${updateInfo?.version ?? ''} is available`}
          </span>
        </>
      )}
    </div>
  )
}
