import { useEffect, useMemo, useRef, useState } from 'react'
import type { LoaderType, MojangVersion } from '@shared/types'
import { useApp } from '../store'

const LOADERS: { value: LoaderType; label: string }[] = [
  { value: 'vanilla',  label: 'Vanilla' },
  { value: 'fabric',   label: 'Fabric' },
  { value: 'forge',    label: 'Forge' },
  { value: 'neoforge', label: 'NeoForge' },
  { value: 'quilt',    label: 'Quilt' },
]

export default function NewInstanceModal({ onClose }: { onClose: () => void }): JSX.Element {
  const refreshInstances = useApp((s) => s.refreshInstances)
  const setError = useApp((s) => s.setError)

  const [name, setName] = useState('')
  const [mcVersions, setMcVersions] = useState<MojangVersion[]>([])
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [mcVersion, setMcVersion] = useState('')
  const [loader, setLoader] = useState<LoaderType>('vanilla')
  const [loaderVersions, setLoaderVersions] = useState<string[]>([])
  const [loaderVersion, setLoaderVersion] = useState('')
  const [loaderVersionsLoading, setLoaderVersionsLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  const loaderFetchRef = useRef<string>('')

  useEffect(() => {
    window.api.mojang
      .versions()
      .then((v) => {
        setMcVersions(v)
        const firstRelease = v.find((x) => x.type === 'release')
        if (firstRelease) setMcVersion(firstRelease.id)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load versions.'))
  }, [setError])

  // Fetch loader versions whenever loader or MC version changes
  useEffect(() => {
    if (loader === 'vanilla' || !mcVersion) {
      setLoaderVersions([])
      setLoaderVersion('')
      return
    }
    const key = `${loader}:${mcVersion}`
    loaderFetchRef.current = key
    setLoaderVersionsLoading(true)
    setLoaderVersions([])
    setLoaderVersion('')
    ;(window.api as any).loader?.versions?.(loader, mcVersion)
      .then((versions: string[]) => {
        if (loaderFetchRef.current !== key) return
        setLoaderVersions(versions)
        setLoaderVersion('') // empty string = "latest" (let launcher resolve)
      })
      .catch(() => {
        if (loaderFetchRef.current !== key) return
        setLoaderVersions([])
      })
      .finally(() => {
        if (loaderFetchRef.current === key) setLoaderVersionsLoading(false)
      })
  }, [loader, mcVersion])

  const shown = useMemo(
    () => mcVersions.filter((v) => (showSnapshots ? true : v.type === 'release')),
    [mcVersions, showSnapshots]
  )

  const loaderLabel = LOADERS.find((l) => l.value === loader)?.label ?? loader
  const defaultName = `${mcVersion || ''}${loader !== 'vanilla' ? ` (${loaderLabel})` : ''}`

  const create = async (): Promise<void> => {
    setCreating(true)
    try {
      await window.api.instances.create({
        name: name.trim() || `Minecraft ${defaultName}`,
        mcVersion,
        loader,
        loaderVersion: loaderVersion || undefined,
        source: 'manual'
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
      <div className="w-[440px] bg-panel border border-border rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">New instance</h2>

        <label className="block text-sm text-muted mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Minecraft ${defaultName}`}
          className="w-full mb-4 px-3 py-2 rounded-lg bg-panel2 border border-border outline-none focus:border-accent2"
        />

        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-muted">Minecraft version</label>
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
          value={mcVersion}
          onChange={(e) => setMcVersion(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg bg-panel2 border border-border outline-none focus:border-accent2"
        >
          {shown.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id} {v.type !== 'release' ? `(${v.type})` : ''}
            </option>
          ))}
        </select>

        <label className="block text-sm text-muted mb-2">Mod loader</label>
        <div className="flex gap-2 flex-wrap mb-4">
          {LOADERS.map((l) => (
            <button
              key={l.value}
              onClick={() => setLoader(l.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={
                loader === l.value
                  ? { background: 'var(--accent-strong)', color: '#000' }
                  : { background: 'var(--surface-2, var(--panel2))', color: 'var(--text-muted)', border: '1px solid var(--border-soft, var(--border))' }
              }
            >
              {l.label}
            </button>
          ))}
        </div>

        {loader !== 'vanilla' && (
          <div className="mb-5">
            <label className="block text-sm text-muted mb-1">
              {loaderLabel} version
            </label>
            <select
              value={loaderVersion}
              onChange={(e) => setLoaderVersion(e.target.value)}
              disabled={loaderVersionsLoading}
              className="w-full px-3 py-2 rounded-lg bg-panel2 border border-border outline-none focus:border-accent2 disabled:opacity-60"
            >
              <option value="">
                {loaderVersionsLoading ? 'Loading versions…' : 'Latest (recommended)'}
              </option>
              {loaderVersions.map((v, i) => (
                <option key={v} value={v}>
                  {v}{i === 0 && !loaderVersionsLoading ? ' ★' : ''}
                </option>
              ))}
            </select>
            <div className="mt-3 rounded-xl px-3 py-2.5 text-xs" style={{ background: 'rgba(var(--accent-rgb),0.08)', border: '1px solid rgba(var(--accent-rgb),0.2)', color: 'var(--text-muted)' }}>
              This creates a custom modpack. After creation, open the instance’s <strong style={{ color: 'var(--accent)' }}>Mods</strong> tab to search compatible Modrinth mods or add local JARs.
            </div>
          </div>
        )}

        {loader === 'vanilla' && <div className="mb-5" />}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-panel2 hover:bg-border text-sm">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={creating || !mcVersion}
            className="px-4 py-2 rounded-lg bg-accent2 hover:bg-accent text-black text-sm font-medium disabled:opacity-60"
          >
            {creating ? 'Creating…' : loader === 'vanilla' ? 'Create instance' : 'Create custom modpack'}
          </button>
        </div>
      </div>
    </div>
  )
}
