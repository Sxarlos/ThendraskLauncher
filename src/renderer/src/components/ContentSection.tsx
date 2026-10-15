import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

export default function ContentSection({ title, description, children, controls, footer, scrollKey }: {
  title: string
  description: string
  children: ReactNode
  controls?: ReactNode
  footer?: ReactNode
  scrollKey?: string
}): JSX.Element {
  const id = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [scrollKey])
  return <section aria-labelledby={id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
    <div className="p-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
      <h3 id={id} className="font-semibold" style={{ color: 'var(--text-bright)' }}>{title}</h3>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{description}</p>
      {controls && <div className="mt-4">{controls}</div>}
    </div>
    <div ref={scrollRef} role="region" aria-labelledby={id} tabIndex={0} className="max-h-[60vh] overflow-y-auto p-4 space-y-4" style={{ scrollbarGutter: 'stable' }}>
      {children}
    </div>
    {footer && <div className="p-3" style={{ borderTop: '1px solid var(--border-soft)' }}>{footer}</div>}
  </section>
}
