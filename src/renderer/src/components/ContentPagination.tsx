export default function ContentPagination({ page, hasNext, loading, onPageChange }: {
  page: number
  hasNext: boolean
  loading: boolean
  onPageChange: (page: number) => void
}): JSX.Element {
  // Providers return a page at a time, so only offer pages we can reach.
  const pages = Array.from({ length: Math.min(page, 3) }, (_, index) => Math.max(1, page - 2) + index)
  if (hasNext) pages.push(page + 1)
  const buttonClass = 'px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40'
  return <nav aria-label="Browse results pages" className="flex flex-wrap items-center justify-between gap-3">
    <button type="button" disabled={loading || page === 1} onClick={() => onPageChange(page - 1)} className={buttonClass}>Previous</button>
    <div className="flex items-center gap-1">
      {page > 3 && <><button type="button" disabled={loading} onClick={() => onPageChange(1)} className={buttonClass}>1</button><span aria-hidden="true">…</span></>}
      {pages.map((number) => <button key={number} type="button" aria-label={`Page ${number}`} aria-current={number === page ? 'page' : undefined} disabled={loading || number === page} onClick={() => onPageChange(number)} className={buttonClass} style={number === page ? { background: 'var(--accent-strong)', color: '#000' } : { background: 'var(--surface-2)', color: 'var(--text-soft)' }}>{number}</button>)}
    </div>
    <button type="button" disabled={loading || !hasNext} onClick={() => onPageChange(page + 1)} className={buttonClass}>Next</button>
  </nav>
}
