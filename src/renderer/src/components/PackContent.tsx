import { useEffect, useState } from 'react'
import type { ContentFile, ContentKind, ContentSearchOptions, Instance, ModSearchResult, ShaderEngine } from '@shared/types'
import { ipcError } from '../lib/ipcError'
import ContentFilters from './ContentFilters'
import RemoveContentButton from './RemoveContentButton'
import ContentSection from './ContentSection'
import ContentPagination from './ContentPagination'
import { CURSEFORGE_ENABLED } from '../../../shared/features'

const surface = { background: 'var(--surface)', border: '1px solid var(--border-soft)' }
const secondary = { background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }

export default function PackContent({ instance, kind, locked, onFindMod }: {
  instance: Instance
  kind: ContentKind
  locked: boolean
  onFindMod: (query: string) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [filters, setFilters] = useState<ContentSearchOptions>({})
  const [engine, setEngine] = useState<ShaderEngine>('iris')
  const [files, setFiles] = useState<ContentFile[]>([])
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [filesLoading, setFilesLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [page, setPage] = useState({ key: '', offset: 0 })
  const [hasMore, setHasMore] = useState(false)
  const searchKey = JSON.stringify([instance.id, kind, query, engine, filters, source])
  const offset = page.key === searchKey ? page.offset : 0
  const label = kind === 'shader' ? 'shaders' : 'texture packs'

  useEffect(() => {
    let cancelled = false
    window.api.content.list(instance.id, kind).then((data) => {
      if (!cancelled) setFiles(data)
    }).catch((e) => { if (!cancelled) setError(ipcError(e)) })
      .finally(() => { if (!cancelled) setFilesLoading(false) })
    return () => { cancelled = true }
  }, [instance.id, kind])

  useEffect(() => {
    let cancelled = false
    const timeout = setTimeout(() => {
      setLoading(true)
      setSearchError(null)
      window.api.content.search(instance.id, kind, query, engine, { ...filters, offset }, source).then((data) => {
        if (!cancelled) {
          setResults(data)
          setHasMore(data.length === 30 && offset < 9990)
        }
      }).catch((e) => { if (!cancelled) { setResults([]); setSearchError(ipcError(e)) } })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [instance.id, kind, query, engine, filters, source, retry, offset])

  const change = async (key: string, action: () => Promise<ContentFile[]>): Promise<void> => {
    setBusy(key)
    setError(null)
    try { setFiles(await action()) } catch (e) { setError(ipcError(e)) } finally { setBusy(null) }
  }
  const disabled = locked || busy !== null

  return <div className="space-y-5">
    <ContentSection title={`Browse ${label}`} description={`Page ${offset / 30 + 1} · Up to 30 results per page. Click Install to add one to this instance.`} scrollKey={`${searchKey}:${offset}`} footer={<ContentPagination page={offset / 30 + 1} hasNext={!searchError && hasMore} loading={loading} onPageChange={(number) => { setResults([]); setSearchError(null); setLoading(true); setPage({ key: searchKey, offset: (number - 1) * 30 }) }} />} controls={<>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold" style={{ color: 'var(--text-bright)' }}>Add {label}</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Browse {source === 'modrinth' ? 'Modrinth' : 'CurseForge'} for Minecraft {instance.mcVersion}, or add your own ZIP.</p>
        </div>
        <button disabled={disabled} onClick={() => void change('import', () => window.api.content.import(instance.id, kind))} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={secondary}>{busy === 'import' ? 'Adding…' : 'Add local ZIP'}</button>
      </div>
      {CURSEFORGE_ENABLED && <div className="flex gap-2" role="group" aria-label="Content provider">
        {(['modrinth', 'curseforge'] as const).map((provider) => <button key={provider} disabled={busy !== null} aria-pressed={source === provider} onClick={() => { setSource(provider); setFilters({}); setResults([]); setPage({ key: '', offset: 0 }); setHasMore(false); setLoading(true) }} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={source === provider ? { background: 'rgba(var(--accent-rgb),0.14)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' } : secondary}>{provider === 'modrinth' ? 'Modrinth' : 'CurseForge'}</button>)}
      </div>}
      {kind === 'shader' && source === 'modrinth' && <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <label htmlFor="shader-engine">Shader engine</label>
        <select id="shader-engine" value={engine} disabled={disabled} onChange={(e) => { setEngine(e.target.value as ShaderEngine); setResults([]); setPage({ key: '', offset: 0 }); setHasMore(false); setLoading(true) }} className="px-3 py-2 rounded-lg" style={secondary}>
          <option value="iris">Iris</option><option value="optifine">OptiFine</option><option value="canvas">Canvas</option>
        </select>
        <span>Choose the engine you use in Minecraft.</span>
      </div>}
      <input aria-label={`Search ${label}`} value={query} onChange={(e) => { setQuery(e.target.value); setResults([]); setPage({ key: '', offset: 0 }); setHasMore(false); setLoading(true) }} placeholder={`Search ${label}…`} className="w-full px-3 py-2.5 rounded-xl text-sm outline-none" style={secondary} />
      <ContentFilters kind={kind} source={source} value={filters} onChange={(value) => { setFilters(value); setResults([]); setPage({ key: '', offset: 0 }); setHasMore(false); setLoading(true) }} />
      {kind === 'shader' && source === 'curseforge' && <p className="text-xs" style={{ color: 'var(--warning)' }}>CurseForge results match your Minecraft version. Check each shader’s project page for its supported engines before installing.</p>}
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {kind === 'resourcepack' ? 'Texture packs are resource packs. After installing, select them in Minecraft → Options → Resource Packs. Some packs also need extra mods; check their project page.' : 'Installing a shader ZIP does not install its engine. Install the matching engine, then select your shader in Minecraft’s video settings.'}
      </p>
      {kind === 'shader' && (instance.loader === 'vanilla'
        ? <p className="text-xs" style={{ color: 'var(--warning)' }}>This is a Vanilla instance. For mod-based shader support, create a pack with a compatible mod loader such as Fabric.</p>
        : source === 'modrinth' && engine !== 'optifine' && <button onClick={() => onFindMod(engine)} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Find {engine === 'iris' ? 'Iris' : 'Canvas'} in Mods →</button>)}
    </div>
    {locked && <p className="text-xs" style={{ color: 'var(--warning)' }}>Stop Minecraft before changing content.</p>}
    {error && <p role="alert" className="text-sm" style={{ color: 'var(--danger-soft)' }}>{error}</p>}
    </>}>
      {loading && <p role="status" className="text-sm text-muted">Loading page {offset / 30 + 1}…</p>}
      {searchError && <div role="alert" className="text-sm"><p style={{ color: 'var(--danger-soft)' }}>{searchError}</p><button onClick={() => setRetry((value) => value + 1)} className="mt-2 text-xs" style={{ color: 'var(--accent)' }}>Try again</button></div>}
      {!loading && !searchError && results.length === 0 && <p className="text-sm text-muted">{offset > 0 ? 'No more results on this page. Use Previous to go back.' : `No matching ${label} for this Minecraft version${kind === 'shader' && source === 'modrinth' ? ` and ${engine}` : ''}. Try another search or add a local ZIP.`}</p>}
      {results.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {results.map((result) => {
          const installed = files.some((file) => file.projectId === result.projectId && (file.source ?? 'modrinth') === result.source)
          return <div key={result.projectId} className="flex gap-3 rounded-xl p-3" style={surface}>
            {result.iconUrl && <img src={result.iconUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
            <div className="flex-1 min-w-0">
              {result.source === 'modrinth' || result.externalUrl ? <button onClick={() => void window.api.shell.openExternal(result.externalUrl ?? `https://modrinth.com/${kind}/${result.projectId}`)} className="text-sm font-semibold text-left hover:underline">{result.title} ↗</button> : <p className="text-sm font-semibold">{result.title}</p>}
              <p className="text-xs text-muted line-clamp-2 mt-1">{result.description}</p>
              <p className="text-xs text-muted mt-2">{result.downloads.toLocaleString()} downloads</p>
            </div>
            <button disabled={disabled || installed} onClick={() => void change(result.projectId, () => window.api.content.install(instance.id, kind, result.projectId, engine, result.source))} className="self-center px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={installed ? secondary : { background: 'var(--accent-strong)', color: '#000' }}>{installed ? 'Installed' : busy === result.projectId ? 'Installing…' : 'Install'}</button>
          </div>
        })}
      </div>}
    </ContentSection>
    <ContentSection title={`Installed ${label} (${files.length})`} description="Already added to this instance. Manage your installed content here.">
      {filesLoading ? <p role="status" className="text-sm text-muted">Loading installed content…</p> : files.length === 0 ? <p className="text-sm text-muted">No {label} yet. Browse above or add a local ZIP.</p> : <div className="space-y-2">
        {files.map((file) => <div key={file.name} className="flex items-center gap-3 p-3 rounded-xl" style={surface}>
          <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{file.title ?? file.name.replace(/\.zip(?:\.disabled)?$/i, '')}</p><p className="text-xs text-muted">{file.enabled ? 'Available in Minecraft' : 'Excluded from Minecraft'} · {(file.size / 1048576).toFixed(1)} MB</p></div>
          <button disabled={disabled} onClick={() => void change(file.name, () => window.api.content.toggle(instance.id, kind, file.name))} className="text-xs px-2 py-1 disabled:opacity-50" style={{ color: 'var(--accent)' }}>{file.enabled ? 'Exclude' : 'Include'}</button>
          <RemoveContentButton disabled={disabled} message={`Remove ${file.title ?? file.name} from this pack?`} onRemove={() => change(file.name, () => window.api.content.remove(instance.id, kind, file.name))} />
        </div>)}
      </div>}
    </ContentSection>
  </div>
}
