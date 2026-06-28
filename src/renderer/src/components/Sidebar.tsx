import { useEffect, useState } from 'react'
import type { Page } from '@shared/types'
import { useApp } from '../store'
import eyeIcon from '../assets/EyeofEnder.png'

/* ── Icons ─────────────────────────────────────────────────── */

function IconHome(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V21h-6.5v-5.5h-5V21H3V10.5z"/>
    </svg>
  )
}

function IconLibrary(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="7" height="18" rx="1.5"/>
      <rect x="11" y="3" width="11" height="11" rx="1.5"/>
      <rect x="11" y="16" width="11" height="5" rx="1.5"/>
    </svg>
  )
}

function IconBrowse(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  )
}

function IconFriends(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4"/>
      <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      <path d="M21 21v-2a4 4 0 0 0-3-3.85"/>
    </svg>
  )
}

function IconServers(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="7" rx="2"/>
      <rect x="2" y="14" width="20" height="7" rx="2"/>
      <circle cx="6.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="6.5" cy="17.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function IconSettings(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}

function IconChevronLeft(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  )
}

function IconChevronRight(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  )
}

/* ── Nav config ─────────────────────────────────────────────── */

const NAV: { id: Page; label: string; icon: JSX.Element }[] = [
  { id: 'home',     label: 'Home',     icon: <IconHome /> },
  { id: 'library',  label: 'Library',  icon: <IconLibrary /> },
  { id: 'servers',  label: 'Servers',  icon: <IconServers /> },
  { id: 'friends',  label: 'Friends',  icon: <IconFriends /> },
  { id: 'settings', label: 'Settings', icon: <IconSettings /> },
]

/* ── Component ──────────────────────────────────────────────── */

export default function Sidebar(): JSX.Element {
  const page             = useApp((s) => s.page)
  const setPage          = useApp((s) => s.setPage)
  const installingCount  = useApp((s) => s.installingCount)
  const updateInfo       = useApp((s) => s.updateInfo)
  const [collapsed, setCollapsed] = useState(false)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.app.getVersion().then(setAppVersion).catch(() => {})
  }, [])

  const W = collapsed ? 52 : 224

  return (
    <aside
      className="shrink-0 flex flex-col overflow-hidden"
      style={{
        width: W,
        minWidth: W,
        maxWidth: W,
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1), max-width 0.22s cubic-bezier(0.4,0,0.2,1)',
        background: 'var(--bg-inset)',
        borderRight: '1px solid var(--border-soft)',
      }}
    >
      {/* Logo */}
      <div
        className="h-14 shrink-0 flex items-center overflow-hidden"
        style={{
          borderBottom: '1px solid var(--border-soft)',
          padding: collapsed ? '0' : '0 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <div className="w-8 h-8 flex items-center justify-center shrink-0">
          <img
            src={eyeIcon}
            width={28}
            height={28}
            style={{ imageRendering: 'pixelated', display: 'block' }}
            alt="Ender Client"
          />
        </div>

        <div
          className="min-w-0 overflow-hidden"
          style={{
            marginLeft: collapsed ? 0 : 12,
            opacity: collapsed ? 0 : 1,
            width: collapsed ? 0 : 'auto',
            transition: 'opacity 0.15s ease, width 0.22s cubic-bezier(0.4,0,0.2,1), margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
            pointerEvents: collapsed ? 'none' : 'auto',
          }}
        >
          <div className="font-bold text-sm text-white leading-tight whitespace-nowrap">Ender Client</div>
          <div className="text-[10px] leading-tight whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{appVersion ? `v${appVersion}` : ''}</div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-hidden">
        {NAV.map((item) => {
          const active = page === item.id

          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              title={collapsed ? item.label : undefined}
              className="relative w-full flex items-center rounded-lg text-sm transition-colors duration-150 group"
              style={{
                gap: collapsed ? 0 : 12,
                padding: collapsed ? '10px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                background: active ? 'rgba(var(--accent-rgb),0.08)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.color = 'var(--text-bright)'
                  e.currentTarget.style.background = 'rgba(var(--overlay-rgb),0.04)'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.color = 'var(--text-muted)'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {/* Active accent bar */}
              {active && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                  style={{ background: 'var(--accent-strong)', boxShadow: '0 0 8px rgba(var(--accent-rgb),0.6)' }}
                />
              )}

              {/* Icon + install badge */}
              <span className="relative shrink-0" style={{ color: active ? 'var(--accent-strong)' : 'inherit' }}>
                {item.icon}
                {item.id === 'library' && installingCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                    style={{ background: 'var(--accent)', boxShadow: '0 0 6px rgba(var(--accent-rgb),0.8)' }}
                  />
                )}
              </span>

              {/* Label — fades out when collapsing */}
              <span
                className="font-medium whitespace-nowrap overflow-hidden"
                style={{
                  opacity: collapsed ? 0 : 1,
                  maxWidth: collapsed ? 0 : 160,
                  transition: 'opacity 0.12s ease, max-width 0.22s cubic-bezier(0.4,0,0.2,1)',
                  display: 'block',
                }}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Update available banner */}
      {updateInfo && (
        <div className="px-2 pb-1 shrink-0">
          <div
            className="flex flex-col rounded-lg overflow-hidden"
            style={{
              padding: collapsed ? '7px 0' : '8px 10px',
              alignItems: collapsed ? 'center' : 'flex-start',
              background: 'rgba(var(--accent-rgb),0.10)',
              border: '1px solid rgba(var(--accent-rgb),0.25)',
            }}
          >
            {/* Icon (always visible) */}
            <div
              className="flex items-center"
              style={{ gap: collapsed ? 0 : 6, width: '100%' }}
              title={collapsed ? `Update v${updateInfo.version} available` : undefined}
            >
              <svg
                width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--accent)', flexShrink: 0 }}
              >
                <path d="M12 2v10m0 0l-3-3m3 3l3-3"/>
                <path d="M20 17a8 8 0 1 1-16 0"/>
              </svg>
              <span
                className="text-xs font-semibold whitespace-nowrap overflow-hidden"
                style={{
                  color: 'var(--accent)',
                  opacity: collapsed ? 0 : 1,
                  maxWidth: collapsed ? 0 : 140,
                  transition: 'opacity 0.12s ease, max-width 0.22s cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                Update v{updateInfo.version}
              </span>
            </div>

            {/* Notes + button (only expanded) */}
            {!collapsed && (
              <>
                {updateInfo.notes && (
                  <p
                    className="text-[10px] leading-relaxed mt-1"
                    style={{ color: 'var(--text-faint)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}
                  >
                    {updateInfo.notes}
                  </p>
                )}
                <button
                  onClick={() => window.api.update.openDownload(updateInfo.downloadUrl)}
                  className="mt-2 w-full text-xs font-semibold rounded-md py-1 transition-opacity hover:opacity-80"
                  style={{
                    background: 'var(--accent)',
                    color: '#000',
                  }}
                >
                  Download
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Installing indicator */}
      {installingCount > 0 && (
        <div className="px-2 pb-1 shrink-0">
          <div
            className="flex items-center rounded-lg overflow-hidden"
            style={{
              gap: collapsed ? 0 : 8,
              padding: collapsed ? '7px 0' : '7px 10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              background: 'rgba(var(--accent-rgb),0.08)',
              border: '1px solid rgba(var(--accent-rgb),0.15)'
            }}
          >
            <span
              className="w-3 h-3 rounded-full border-2 shrink-0"
              style={{
                borderColor: 'rgba(var(--accent-rgb),0.25)',
                borderTopColor: 'var(--accent)',
                animation: 'spin 0.8s linear infinite'
              }}
            />
            <span
              className="text-xs font-medium whitespace-nowrap overflow-hidden"
              style={{
                color: 'var(--accent)',
                opacity: collapsed ? 0 : 1,
                maxWidth: collapsed ? 0 : 120,
                transition: 'opacity 0.12s ease, max-width 0.22s cubic-bezier(0.4,0,0.2,1)'
              }}
            >
              Installing…
            </span>
          </div>
        </div>
      )}

      {/* Collapse toggle button */}
      <div className="px-2 pb-2 shrink-0">
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center justify-center rounded-lg py-2 transition-colors duration-150"
          style={{ border: '1px solid var(--border-soft)', color: 'var(--text-dim)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-soft)'
            e.currentTarget.style.color = 'var(--text-dim)'
          }}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      {/* Footer */}
      <div
        className="px-3 pb-3 shrink-0 overflow-hidden"
        style={{
          borderTop: '1px solid var(--border-soft)',
          opacity: collapsed ? 0 : 1,
          maxHeight: collapsed ? 0 : 40,
          paddingTop: collapsed ? 0 : 12,
          transition: 'opacity 0.15s ease, max-height 0.22s cubic-bezier(0.4,0,0.2,1), padding-top 0.22s ease',
        }}
      >
        <div className="text-[10px] leading-relaxed whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
          Not affiliated with Mojang / Microsoft
        </div>
      </div>
    </aside>
  )
}
