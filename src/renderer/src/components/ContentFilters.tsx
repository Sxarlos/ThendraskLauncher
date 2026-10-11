import { useEffect, useId, useState } from 'react'
import type { ContentCategory, ContentKind, ContentSearchOptions, ContentSort } from '@shared/types'
import { ipcError } from '../lib/ipcError'

export default function ContentFilters({ kind, source, value, onChange }: {
  kind: ContentKind | 'mod'
  source: 'modrinth' | 'curseforge'
  value: ContentSearchOptions
  onChange: (value: ContentSearchOptions) => void
}): JSX.Element {
  const id = useId()
  const key = `${source}:${kind}`
  const [result, setResult] = useState<{ key: string; categories: ContentCategory[]; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const categories = result?.key === key ? result.categories : []
  const loading = result?.key !== key
  const error = result?.key === key ? result.error : undefined
  const groups = [...new Set(categories.map((category) => category.group))]
  const style = { background: 'var(--surface-2)', color: 'var(--text-soft)', border: '1px solid var(--border-soft)' }

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => window.api.content.categories(kind, source))
      .then((categories) => { if (!cancelled) setResult({ key, categories }) })
      .catch((error) => { if (!cancelled) setResult({ key, categories: [], error: ipcError(error) }) })
    return () => { cancelled = true }
  }, [kind, source, key, retry])

  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[180px]">
        <label htmlFor={`${id}-category`} className="block text-xs text-muted mb-1">Category</label>
        <select id={`${id}-category`} value={value.category ?? ''} disabled={loading || !!error} onChange={(e) => onChange({ ...value, category: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm disabled:opacity-50" style={style}>
          <option value="">{loading ? 'Loading categories…' : 'All categories'}</option>
          {groups.map((group) => <optgroup key={group} label={group}>{categories.filter((category) => category.group === group).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup>)}
        </select>
      </div>
      <div className="flex-1 min-w-[180px]">
        <label htmlFor={`${id}-sort`} className="block text-xs text-muted mb-1">Sort by</label>
        <select id={`${id}-sort`} value={value.sort ?? 'relevance'} onChange={(e) => onChange({ ...value, sort: e.target.value as ContentSort })} className="w-full px-3 py-2 rounded-xl text-sm" style={style}>
          <option value="relevance">{source === 'curseforge' ? 'Popularity' : 'Recommended / relevance'}</option>
          <option value="downloads">Most downloaded</option>
          <option value="updated">Recently updated</option>
          <option value="newest">Newest</option>
          {source === 'modrinth' && <option value="follows">Most followed</option>}
        </select>
      </div>
      {(value.category || (value.sort && value.sort !== 'relevance')) && <button onClick={() => onChange({})} className="text-xs px-3 py-2" style={{ color: 'var(--accent)' }}>Clear filters</button>}
    </div>
    {error ? <p role="alert" className="text-xs" style={{ color: 'var(--warning)' }}>{error} You can still search. <button className="underline" onClick={() => setRetry((value) => value + 1)}>Retry categories</button></p> : <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Categories from {source === 'modrinth' ? 'Modrinth' : 'CurseForge'}{value.category ? ` · ${categories.find((category) => category.id === value.category)?.name ?? value.category}` : ''}</p>}
  </div>
}
