import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GregTechCommunityAddon, GTNHSpecialBuild, GTNHUpdateInfo, GTNHUpdateProgress, Instance, LocalMod, ModSearchResult } from '@shared/types'
import { useApp } from '../store'
import { ipcError } from '../lib/ipcError'

type Source = 'modrinth' | 'curseforge'

function isLikelyGregTech(instance: Instance): boolean {
  return /greg\s*tech|gtnh|new horizons|nomifactory|omnifactory|monifactory/i.test(instance.name)
}

function isGTNewHorizons(instance: Instance | undefined): boolean {
  return !!instance && !instance.packVersionId?.startsWith('special:') && instance.mcVersion === '1.7.10' && /gtnh|gt new horizons|new horizons/i.test(instance.name)
}

function formatBytes(value: number): string {
  return `${(value / (1024 * 1024)).toFixed(0)} MB`
}

function formatDiskSpace(value: number): string {
  return `${(value / (1024 ** 3)).toFixed(1)} GB`
}

function formatDownloads(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function isGregTechCorePackage(mod: ModSearchResult): boolean {
  const title = mod.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return /^(gregtech|gregtech 5|gregtech 5 unofficial|gregtech community edition|gregtech ceu|gregtech modern)$/.test(title)
}

export default function GregTech(): JSX.Element {
  const instances = useApp((state) => state.instances)
  const setError = useApp((state) => state.setError)
  const setInstalling = useApp((state) => state.setInstalling)
  const refreshInstances = useApp((state) => state.refreshInstances)
  const moddedInstances = useMemo(() => instances.filter((instance) => instance.loader !== 'vanilla'), [instances])
  const preferred = useMemo(() => moddedInstances.filter(isLikelyGregTech), [moddedInstances])
  const [instanceId, setInstanceId] = useState('')
  const [source, setSource] = useState<Source>('curseforge')
  const [query, setQuery] = useState('gregtech')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [installed, setInstalled] = useState<LocalMod[]>([])
  const [communityAddons, setCommunityAddons] = useState<GregTechCommunityAddon[]>([])
  const [loading, setLoading] = useState(false)
  const [installingKey, setInstallingKey] = useState<string | null>(null)
  const [packUpdate, setPackUpdate] = useState<GTNHUpdateInfo | null>(null)
  const [checkingPackUpdate, setCheckingPackUpdate] = useState(false)
  const [updatingPack, setUpdatingPack] = useState(false)
  const [packUpdateProgress, setPackUpdateProgress] = useState<GTNHUpdateProgress | null>(null)
  const [showBetaBuilds, setShowBetaBuilds] = useState(false)
  const [betaUpdate, setBetaUpdate] = useState<GTNHUpdateInfo | null>(null)
  const [checkingBetaUpdate, setCheckingBetaUpdate] = useState(false)
  const [showSpecialBuilds, setShowSpecialBuilds] = useState(false)
  const [specialBuilds, setSpecialBuilds] = useState<GTNHSpecialBuild[]>([])
  const [checkingSpecialBuilds, setCheckingSpecialBuilds] = useState(false)
  const [installingSpecialId, setInstallingSpecialId] = useState<string | null>(null)
  const effectiveInstanceId = moddedInstances.some((instance) => instance.id === instanceId)
    ? instanceId
    : (preferred[0] ?? moddedInstances[0])?.id ?? ''
  const selected = moddedInstances.find((instance) => instance.id === effectiveInstanceId)

  const refreshInstalled = useCallback(async (targetId: string): Promise<void> => {
    setInstalled(await window.api.customMods.list(targetId))
  }, [])

  useEffect(() => {
    if (!effectiveInstanceId) return
    Promise.all([
      window.api.customMods.list(effectiveInstanceId),
      window.api.gregtech.addons(effectiveInstanceId)
    ])
      .then(([managed, community]) => {
        setInstalled(managed)
        setCommunityAddons(community)
      })
      .catch((error) => setError(ipcError(error)))
  }, [effectiveInstanceId, setError])

  const checkPackUpdate = useCallback(async (targetId = effectiveInstanceId): Promise<void> => {
    const target = moddedInstances.find((instance) => instance.id === targetId)
    if (!targetId || !isGTNewHorizons(target)) {
      setPackUpdate(null)
      return
    }
    setCheckingPackUpdate(true)
    try {
      setPackUpdate(await window.api.gregtech.checkPackUpdate(targetId))
    } catch (error) {
      setPackUpdate(null)
      setError(ipcError(error))
    } finally {
      setCheckingPackUpdate(false)
    }
  }, [effectiveInstanceId, moddedInstances, setError])

  useEffect(() => {
    const timer = window.setTimeout(() => void checkPackUpdate(), 0)
    return () => window.clearTimeout(timer)
  }, [checkPackUpdate])

  useEffect(() => window.api.gregtech.onPackUpdateProgress((progress) => {
    if (progress.instanceId === effectiveInstanceId) setPackUpdateProgress(progress)
  }), [effectiveInstanceId])

  const search = useCallback(async (term = query, selectedSource = source): Promise<void> => {
    if (!effectiveInstanceId || !term.trim()) return
    setLoading(true)
    setError(null)
    try {
      const found = await window.api.customMods.search(effectiveInstanceId, term.trim(), selectedSource)
      setResults(found)
    } catch (error) {
      setResults([])
      setError(ipcError(error))
    } finally {
      setLoading(false)
    }
  }, [effectiveInstanceId, query, setError, source])

  const install = async (mod: ModSearchResult): Promise<void> => {
    if (!effectiveInstanceId) return
    const key = `${mod.source}:${mod.projectId}`
    setInstallingKey(key)
    setInstalling(1)
    setError(null)
    try {
      await window.api.customMods.install(effectiveInstanceId, mod.projectId, mod.source)
      await refreshInstalled(effectiveInstanceId)
    } catch (error) {
      setError(ipcError(error))
    } finally {
      setInstallingKey(null)
      setInstalling(-1)
    }
  }

  const installCommunityAddon = async (addon: GregTechCommunityAddon): Promise<void> => {
    if (!effectiveInstanceId) return
    const key = `github:${addon.id}`
    setInstallingKey(key)
    setInstalling(1)
    setError(null)
    try {
      setCommunityAddons(await window.api.gregtech.install(effectiveInstanceId, addon.id))
    } catch (error) {
      setError(ipcError(error))
    } finally {
      setInstallingKey(null)
      setInstalling(-1)
    }
  }

  const revealBetaBuilds = async (): Promise<void> => {
    if (showBetaBuilds) {
      setShowBetaBuilds(false)
      return
    }
    setShowBetaBuilds(true)
    if (!effectiveInstanceId) return
    setCheckingBetaUpdate(true)
    try {
      setBetaUpdate(await window.api.gregtech.checkPackUpdate(effectiveInstanceId, 'beta'))
    } catch (error) {
      setError(ipcError(error))
    } finally {
      setCheckingBetaUpdate(false)
    }
  }

  const updateGTNHPack = async (info: GTNHUpdateInfo): Promise<void> => {
    if (!effectiveInstanceId || !info.available || info.diskSpaceSufficient === false) return
    setUpdatingPack(true)
    setInstalling(1)
    setError(null)
    setPackUpdateProgress({ instanceId: effectiveInstanceId, message: 'Preparing GTNH update…', percent: 0 })
    try {
      const updated = await window.api.gregtech.installPackUpdate(effectiveInstanceId, info.channel)
      await refreshInstances()
      setInstanceId(updated.id)
      if (info.channel === 'beta') setBetaUpdate({ ...info, currentVersion: info.latestVersion, available: false })
      else setPackUpdate({ ...info, currentVersion: info.latestVersion, available: false })
    } catch (error) {
      setError(ipcError(error))
    } finally {
      setUpdatingPack(false)
      setInstalling(-1)
    }
  }

  const revealSpecialBuilds = async (): Promise<void> => {
    if (showSpecialBuilds) {
      setShowSpecialBuilds(false)
      return
    }
    setShowSpecialBuilds(true)
    if (!effectiveInstanceId || specialBuilds.length) return
    setCheckingSpecialBuilds(true)
    try {
      setSpecialBuilds(await window.api.gregtech.specialBuilds(effectiveInstanceId))
    } catch (error) {
      setError(ipcError(error))
    } finally {
      setCheckingSpecialBuilds(false)
    }
  }

  const installSpecialBuild = async (build: GTNHSpecialBuild): Promise<void> => {
    if (!effectiveInstanceId || build.diskSpaceSufficient === false) return
    setInstallingSpecialId(build.id)
    setUpdatingPack(true)
    setInstalling(1)
    setError(null)
    setPackUpdateProgress({ instanceId: effectiveInstanceId, message: `Preparing ${build.title}…`, percent: 0 })
    try {
      const created = await window.api.gregtech.installSpecialBuild(effectiveInstanceId, build.id)
      await refreshInstances()
      setInstanceId(created.id)
    } catch (error) {
      setError(ipcError(error))
    } finally {
      setInstallingSpecialId(null)
      setUpdatingPack(false)
      setInstalling(-1)
    }
  }

  const installedKeys = new Set(installed.flatMap((mod) =>
    mod.projectId && mod.source ? [`${mod.source}:${mod.projectId}`] : []
  ))
  const addonResults = results.filter((mod) => !isGregTechCorePackage(mod))

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <section className="rounded-2xl p-5 overflow-hidden relative" style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.13), var(--surface))', border: '1px solid rgba(var(--accent-rgb),0.22)' }}>
          <div className="absolute right-5 top-3 text-7xl font-black opacity-[0.035] select-none">GT</div>
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2" style={{ color: 'var(--accent)' }}>Community workshop</div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-bright)' }}>GregTech Hub</h1>
            <p className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Find addons and quality-of-life mods compatible with your selected GregTech pack. Installs create a recovery snapshot first and include required dependencies.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => window.api.shell.openExternal('https://wiki.gtnewhorizons.com/')} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.22)' }}>GTNH Wiki ↗</button>
              <button onClick={() => window.api.shell.openExternal('https://github.com/GTNewHorizons')} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.22)' }}>GTNH GitHub ↗</button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(260px,2fr)_auto]">
            <select value={effectiveInstanceId} onChange={(event) => {
              setInstanceId(event.target.value)
              setShowBetaBuilds(false)
              setBetaUpdate(null)
              setShowSpecialBuilds(false)
              setSpecialBuilds([])
              setPackUpdateProgress(null)
            }} className="px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--surface-2)', color: 'var(--text-bright)', border: '1px solid var(--border)' }}>
              {moddedInstances.length === 0 && <option value="">No modded instances installed</option>}
              {preferred.length > 0 && <optgroup label="Detected GregTech packs">{preferred.map((instance) => <option key={instance.id} value={instance.id}>{instance.name} · {instance.mcVersion}</option>)}</optgroup>}
              <optgroup label={preferred.length ? 'Other modded instances' : 'Modded instances'}>
                {moddedInstances.filter((instance) => !preferred.includes(instance)).map((instance) => <option key={instance.id} value={instance.id}>{instance.name} · {instance.mcVersion}</option>)}
              </optgroup>
            </select>
            <div className="flex gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search() }} placeholder="Search GregTech addons…" className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--surface-2)', color: 'var(--text-bright)', border: '1px solid var(--border)' }} />
              <button disabled={!effectiveInstanceId || loading} onClick={() => void search()} className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--accent-strong)', color: '#000' }}>{loading ? 'Searching…' : 'Search'}</button>
            </div>
            <div className="flex rounded-xl p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {(['curseforge', 'modrinth'] as Source[]).map((item) => <button key={item} onClick={() => { setSource(item); void search(query, item) }} className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize" style={{ background: source === item ? 'rgba(var(--accent-rgb),0.14)' : 'transparent', color: source === item ? 'var(--accent)' : 'var(--text-muted)' }}>{item}</button>)}
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {['gregtech', 'gtnh', 'gregtech addon', 'quality of life'].map((term) => <button key={term} onClick={() => { setQuery(term); void search(term) }} disabled={!effectiveInstanceId} className="px-2.5 py-1 rounded-lg text-[11px] disabled:opacity-40" style={{ color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}>{term}</button>)}
          </div>
        </section>

        {selected && !isLikelyGregTech(selected) && (
          <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', color: '#d9ad63' }}>
            This instance was not automatically identified as a GregTech pack. Compatibility filters still apply, but confirm the addon’s requirements before installing it.
          </div>
        )}

        {isGTNewHorizons(selected) && (
          <section className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: 'var(--accent)' }}>Official stable releases</div>
                <h2 className="text-base font-bold mt-1" style={{ color: 'var(--text-bright)' }}>GT New Horizons pack updates</h2>
                {checkingPackUpdate ? (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Checking the official GTNH version history…</p>
                ) : packUpdate ? (
                  <>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      Installed: {packUpdate.currentVersion} · Latest stable: {packUpdate.latestVersion}
                      {packUpdate.downloadBytes ? ` · ${formatBytes(packUpdate.downloadBytes)} download` : ''}
                    </p>
                    {packUpdate.requiredBytes && packUpdate.freeBytes && <p className="text-[11px] mt-1" style={{ color: packUpdate.diskSpaceSufficient === false ? '#e27979' : 'var(--text-faint)' }}>Needs about {formatDiskSpace(packUpdate.requiredBytes)} free · {formatDiskSpace(packUpdate.freeBytes)} available{packUpdate.diskSpaceSufficient === false ? '. Free some space before installing.' : ''}</p>}
                  </>
                ) : (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Update information is unavailable.</p>
                )}
                <p className="text-[11px] mt-2 leading-relaxed max-w-3xl" style={{ color: 'var(--text-faint)' }}>
                  Updates create a fresh instance and migrate worlds, JourneyMap data, prospecting data, options, servers, screenshots, resource packs, and schematics. The old instance remains untouched for rollback. Community addon JARs are not copied; reinstall compatible versions from this hub afterward.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {packUpdate?.changelogUrl && <button onClick={() => void window.api.shell.openExternal(packUpdate.changelogUrl!)} className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>Changelog ↗</button>}
                <button onClick={() => void window.api.shell.openExternal(packUpdate?.releasePageUrl ?? 'https://www.gtnewhorizons.com/version-history/')} className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>Version history ↗</button>
                {packUpdate?.available ? (
                  <button disabled={updatingPack || packUpdate.diskSpaceSufficient === false} onClick={() => void updateGTNHPack(packUpdate)} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent-strong)', color: '#000' }}>{updatingPack ? 'Updating…' : packUpdate.diskSpaceSufficient === false ? 'Not enough space' : `Create ${packUpdate.latestVersion} instance`}</button>
                ) : (
                  <button disabled={checkingPackUpdate} onClick={() => void checkPackUpdate()} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{checkingPackUpdate ? 'Checking…' : packUpdate ? 'Up to date' : 'Try again'}</button>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-2)' }}>
              <button onClick={() => void revealBetaBuilds()} disabled={updatingPack} className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left disabled:opacity-50">
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-bright)' }}>Preview beta builds</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>Manual opt-in only. Beta releases never create update prompts or notifications.</div>
                </div>
                <span className="text-xs" style={{ color: 'var(--accent)', transform: showBetaBuilds ? 'rotate(180deg)' : 'none' }}>⌄</span>
              </button>
              {showBetaBuilds && (
                <div className="px-3.5 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <div>
                    {checkingBetaUpdate ? (
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Checking preview releases…</div>
                    ) : betaUpdate ? (
                      <>
                        <div className="text-xs font-semibold" style={{ color: 'var(--text-bright)' }}>{betaUpdate.latestVersion}</div>
                        <div className="text-[11px] mt-1 leading-relaxed max-w-2xl" style={{ color: '#d9ad63' }}>Experimental build: worlds and community addons may not be compatible. The launcher still creates a separate instance and keeps your stable pack untouched.</div>
                        {betaUpdate.requiredBytes && betaUpdate.freeBytes && <div className="text-[11px] mt-1" style={{ color: betaUpdate.diskSpaceSufficient === false ? '#e27979' : 'var(--text-faint)' }}>Needs about {formatDiskSpace(betaUpdate.requiredBytes)} free · {formatDiskSpace(betaUpdate.freeBytes)} available</div>}
                      </>
                    ) : (
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Beta information is unavailable.</div>
                    )}
                  </div>
                  {betaUpdate?.available && (
                    <div className="flex gap-2 shrink-0">
                      {betaUpdate.changelogUrl && <button onClick={() => void window.api.shell.openExternal(betaUpdate.changelogUrl!)} className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ color: '#e4b75f', border: '1px solid rgba(245,158,11,0.28)' }}>Changelog ↗</button>}
                      <button disabled={updatingPack || betaUpdate.diskSpaceSufficient === false} onClick={() => void updateGTNHPack(betaUpdate)} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={{ background: 'rgba(245,158,11,0.14)', color: '#e4b75f', border: '1px solid rgba(245,158,11,0.28)' }}>{updatingPack ? 'Updating…' : betaUpdate.diskSpaceSufficient === false ? 'Not enough space' : `Create beta ${betaUpdate.latestVersion}`}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-2)' }}>
              <button onClick={() => void revealSpecialBuilds()} disabled={updatingPack} className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left disabled:opacity-50">
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-bright)' }}>Special builds &amp; April Fools editions</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>Manual installs only. These never create update prompts and do not copy your worlds or settings.</div>
                </div>
                <span className="text-xs" style={{ color: 'var(--accent)', transform: showSpecialBuilds ? 'rotate(180deg)' : 'none' }}>⌄</span>
              </button>
              {showSpecialBuilds && (
                <div className="px-3.5 py-3 space-y-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
                  {checkingSpecialBuilds && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Checking official special builds…</div>}
                  {!checkingSpecialBuilds && specialBuilds.length === 0 && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No official special builds are currently listed.</div>}
                  {specialBuilds.map((build) => (
                    <div key={build.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-xs font-semibold" style={{ color: 'var(--text-bright)' }}>{build.title}{build.date ? ` · ${build.date}` : ''}</div>
                        <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{build.description}</div>
                        <div className="text-[11px] mt-1" style={{ color: build.diskSpaceSufficient === false ? '#e27979' : 'var(--text-faint)' }}>
                          {build.downloadBytes ? `${formatBytes(build.downloadBytes)} download` : 'Download size unavailable'}{build.requiredBytes && build.freeBytes ? ` · needs about ${formatDiskSpace(build.requiredBytes)} free · ${formatDiskSpace(build.freeBytes)} available` : ''}
                        </div>
                      </div>
                      <button disabled={updatingPack || build.diskSpaceSufficient === false} onClick={() => void installSpecialBuild(build)} className="px-3 py-2 rounded-xl text-xs font-semibold shrink-0 disabled:opacity-50" style={{ background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>{installingSpecialId === build.id ? 'Installing…' : build.diskSpaceSufficient === false ? 'Not enough space' : 'Create isolated instance'}</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {packUpdateProgress && (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}><span>{packUpdateProgress.message}</span><span>{packUpdateProgress.percent ?? 0}%</span></div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}><div className="h-full rounded-full transition-all" style={{ width: `${packUpdateProgress.percent ?? 0}%`, background: 'var(--accent-strong)' }} /></div>
              </div>
            )}
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: 'var(--accent)' }}>Outside CurseForge &amp; Modrinth</div>
              <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--text-bright)' }}>GTNH community releases</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Pinned to versions verified by each addon’s official compatibility table.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {communityAddons.map((addon) => {
              const key = `github:${addon.id}`
              const isInstalling = installingKey === key
              const installedVersion = addon.installedVersion
              return (
                <article key={addon.id} className="rounded-2xl p-4 flex flex-col" style={{ background: 'var(--surface)', border: '1px solid rgba(var(--accent-rgb),0.18)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold" style={{ color: 'var(--text-bright)' }}>{addon.title}</h3>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>by {addon.author} · {addon.category}</p>
                    </div>
                    <span className="px-2 py-1 rounded-lg text-[10px] font-semibold shrink-0" style={{ background: addon.installable || installedVersion ? 'rgba(var(--accent-rgb),0.10)' : 'rgba(245,158,11,0.08)', color: addon.installable || installedVersion ? 'var(--accent)' : '#d9ad63' }}>
                      {installedVersion ? `Installed ${installedVersion}` : addon.compatibleVersion ?? 'Unavailable'}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed mt-3 flex-1" style={{ color: 'var(--text-muted)' }}>{addon.description}</p>
                  <div className="rounded-lg px-2.5 py-2 text-[11px] mt-3" style={{ background: 'var(--surface-2)', color: addon.compatibleVersion ? 'var(--text-muted)' : '#d9ad63' }}>{addon.compatibilityLabel}</div>
                  <div className="flex items-center justify-between mt-3">
                    <button onClick={() => void window.api.shell.openExternal(addon.repositoryUrl)} className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>Official project ↗</button>
                    <button disabled={!addon.installable || installingKey !== null} onClick={() => void installCommunityAddon(addon)} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: installedVersion ? 'rgba(var(--accent-rgb),0.10)' : 'var(--accent-strong)', color: installedVersion ? 'var(--accent)' : '#000' }}>
                      {installedVersion ? 'Installed' : isInstalling ? 'Installing…' : 'Install'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          {communityAddons.length > 0 && (
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
              These are unofficial GTNH expansions. Multiplayer servers need the same addon versions. When updating either addon later, follow its project instructions because its GregTech language and addon config files may need to be reset.
            </p>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {addonResults.map((mod) => {
            const key = `${mod.source}:${mod.projectId}`
            const isInstalled = installedKeys.has(key)
            return (
              <article key={key} className="rounded-2xl p-4 flex flex-col min-h-44" style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)' }}>
                <div className="flex gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-xl" style={{ background: 'var(--surface-2)' }}>{mod.iconUrl ? <img src={mod.iconUrl} alt="" className="w-full h-full object-cover" /> : '⚙'}</div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-sm truncate" style={{ color: 'var(--text-bright)' }}>{mod.title}</h2>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-faint)' }}>{mod.author ? `by ${mod.author} · ` : ''}{formatDownloads(mod.downloads)} downloads</p>
                  </div>
                </div>
                <p className="text-xs leading-relaxed mt-3 line-clamp-3 flex-1" style={{ color: 'var(--text-muted)' }}>{mod.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{mod.source}</span>
                  <button disabled={isInstalled || installingKey !== null} onClick={() => void install(mod)} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: isInstalled ? 'rgba(var(--accent-rgb),0.10)' : 'var(--accent-strong)', color: isInstalled ? 'var(--accent)' : '#000' }}>{isInstalled ? 'Installed' : installingKey === key ? 'Installing…' : 'Install'}</button>
                </div>
              </article>
            )
          })}
        </div>

        {!loading && addonResults.length === 0 && (
          <div className="rounded-2xl py-14 text-center" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
            <div className="text-3xl mb-3">⚙</div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-bright)' }}>Choose a pack and search for compatible addons</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Only results matching the selected Minecraft version and mod loader are shown.</p>
          </div>
        )}

        <p className="text-[11px] leading-relaxed pb-3" style={{ color: 'var(--text-faint)' }}>
          Community addons can change recipes, balance, or world data and may not be supported by a modpack’s maintainers. Keep the automatic pre-install snapshot until you have tested your world.
        </p>
      </div>
    </div>
  )
}
