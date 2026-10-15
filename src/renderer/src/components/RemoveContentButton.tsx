import { useState } from 'react'

// Keep confirmation inside React: window.confirm can strand keyboard focus
// after closing its blocking dialog in the Windows Electron renderer.
export default function RemoveContentButton({ disabled, message, onRemove }: {
  disabled: boolean
  message: string
  onRemove: () => Promise<void>
}): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)

  const remove = async (): Promise<void> => {
    setRemoving(true)
    try {
      await onRemove()
    } finally {
      setRemoving(false)
      setConfirming(false)
    }
  }

  return <span className="text-xs" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
    event.stopPropagation()
    if (event.key === 'Escape') setConfirming(false)
  }}>
    {confirming ? <span className="flex flex-wrap items-center gap-2">
      <span role="alert">{message}</span>
      <button type="button" disabled={disabled || removing} onClick={() => void remove()} className="px-2 py-1 disabled:opacity-50" style={{ color: 'var(--danger-soft)' }}>{removing ? 'Removing…' : 'Confirm removal'}</button>
      <button type="button" autoFocus disabled={removing} onClick={() => setConfirming(false)} className="px-2 py-1" style={{ color: 'var(--text-muted)' }}>Cancel</button>
    </span> : <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className="px-2 py-1 disabled:opacity-50" style={{ color: 'var(--danger-soft)' }}>Remove</button>}
  </span>
}
