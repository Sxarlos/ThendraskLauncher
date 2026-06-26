interface Props {
  size?: number
  /** Adds outer glow rings and filter — looks great on dark backgrounds */
  glow?: boolean
}

export default function EyeOfEnder({ size = 64, glow = false }: Props): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ overflow: 'visible', display: 'block' }}
    >
      <defs>
        <radialGradient id="eoe-shell" cx="50%" cy="45%" r="55%">
          <stop offset="0%"   stopColor="#003d1f" />
          <stop offset="100%" stopColor="#00100a" />
        </radialGradient>

        <radialGradient id="eoe-iris" cx="50%" cy="38%" r="58%">
          <stop offset="0%"   stopColor="#c8ffd6" />
          <stop offset="22%"  stopColor="#2eea7a" />
          <stop offset="50%"  stopColor="#00994d" />
          <stop offset="78%"  stopColor="#004422" />
          <stop offset="100%" stopColor="#001a0d" />
        </radialGradient>

        <radialGradient id="eoe-pupil" cx="36%" cy="32%" r="68%">
          <stop offset="0%"   stopColor="var(--text-strong)" />
          <stop offset="30%"  stopColor="#d8fff0" />
          <stop offset="100%" stopColor="#001a0d" />
        </radialGradient>

        {glow && (
          <filter id="eoe-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}

        <filter id="eoe-soft" x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer ambient aura — only when glow is on */}
      {glow && (
        <>
          <ellipse cx="32" cy="32" rx="31" ry="31" fill="#00cc55" opacity="0.07" />
          <ellipse cx="32" cy="32" rx="24" ry="24" fill="#00ff77" opacity="0.09" />
        </>
      )}

      {/* Dark outer shell */}
      <ellipse
        cx="32" cy="32" rx="20" ry="24"
        fill="url(#eoe-shell)"
        filter={glow ? 'url(#eoe-glow)' : undefined}
      />

      {/* Main iris / eye body */}
      <ellipse cx="32" cy="32" rx="15" ry="19" fill="url(#eoe-iris)" />

      {/* Mid-tone glow band */}
      <ellipse cx="32" cy="32" rx="9" ry="13" fill="#00ff77" opacity="0.18" filter="url(#eoe-soft)" />

      {/* Vertical cat-eye pupil */}
      <ellipse cx="32" cy="32" rx="4.2" ry="9.5" fill="url(#eoe-pupil)" />

      {/* Primary highlight — upper-left catch-light */}
      <ellipse cx="29.2" cy="26.5" rx="2.8" ry="3.8" fill="white" opacity="0.95" />

      {/* Smaller secondary sparkle */}
      <ellipse cx="34.2" cy="22.8" rx="1.1" ry="1.6" fill="white" opacity="0.55" />

      {/* Subtle bottom-right glint */}
      <ellipse cx="35" cy="38" rx="1" ry="1.4" fill="#aaffcc" opacity="0.35" />
    </svg>
  )
}
