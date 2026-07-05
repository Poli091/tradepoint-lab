/**
 * MODULE: UI / Badge.jsx
 * Small inline label for types, priorities, and statuses.
 */

const STYLES = {
  catalyst: { bg: 'var(--accent-dim)',  color: 'var(--accent)' },
  decision: { bg: 'var(--amber-dim)',   color: 'var(--amber)'  },
  critical: { bg: 'var(--red-dim)',     color: 'var(--red)'    },
  monitor:  { bg: 'var(--purple-dim)',  color: 'var(--purple)' },
  high:     { bg: 'var(--red-dim)',     color: 'var(--red)'    },
  med:      { bg: 'var(--amber-dim)',   color: 'var(--amber)'  },
  success:  { bg: 'var(--green-dim)',   color: 'var(--green)'  },
  neutral:  { bg: 'var(--surface-up)', color: 'var(--txt-muted)' },
}

export default function Badge({ label, type = 'neutral' }) {
  const s = STYLES[type] ?? STYLES.neutral
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: 10,
      fontFamily: 'var(--mono)',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      background: s.bg,
      color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
