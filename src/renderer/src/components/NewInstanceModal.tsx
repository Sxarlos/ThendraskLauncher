import { useEffect, useMemo, useState } from 'react'
import type { MojangVersion } from '@shared/types'
import { useApp } from '../store'

export default function NewInstanceModal({ onClose }: { onClose: () => void }): JSX.Element {
  const refreshInstances = useApp((s) => s.refreshInstances)
  const setError = useApp((s) => s.setError)

  const [name, setName] = useState('')
  const [versions, setVersions] = useState<MojangVersion[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [version, setVersion] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    window.api.mojang
      .versions()
      .then((v) => {
        setVersions(v)
        const firstRelease = v.find((x) => x.type === 'release')
        if (firstRelease) setVersion(firstRelease.id)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load versions.'))
  }, [setError])

  const shown = useMemo(
    () => versions.filter((v) => (showSnapshots ? true : v.type === 'release')),
    [versions, showSnapshots]
  )

  const create = async (): Promise<void> => {
    setCreating(true)
    try {
      await window.api.instances.create({
        name: name || `Minecraft ${version}`,
        mcVersion: version,
        loader: 'vanilla'
      })
      await refreshInstances()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create instance.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-30">
      <div className="w-[420px] bg-panel border border-border rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">New vanilla instance</h2>

        <label className="block text-sm text-muted mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Minecraft ${version || ''}`}
          className="w-full mb-4 px-3 py-2 rounded-lg bg-panel2 border border-border outline-none focus:border-accent2"
        />

        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-muted">Version</label>
          <label className="text-xs text-muted flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showSnapshots}
              onChange={(e) => setShowSnapshots(e.target.checked)}
            />
            show snapshots
          </label>
        </div>
        <select
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className="w-full mb-5 px-3 py-2 rounded-lg bg-panel2 border border-border outline-none focus:border-accent2"
        >
          {shown.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id} {v.type !== 'release' ? `(${v.type})` : ''}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-panel2 hover:bg-border text-sm">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={creating || !version}
            className="px-4 py-2 rounded-lg bg-accent2 hover:bg-accent text-black text-sm font-medium disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
