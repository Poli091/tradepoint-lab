/**
 * MODULE: UI / ConvictionRing.jsx
 * Circular SVG progress ring showing the conviction score (0–100).
 * Color: green ≥76 · amber 60–75 · red <60
 */

function scoreColor(score) {
  if (score >= 76) return 'var(--green)'
  if (score >= 60) return 'var(--amber)'
  return 'var(--red)'
}

export default function ConvictionRing({ score, size = 42 }) {
  const strokeWidth = 3.5
  const r = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const color = scoreColor(score)
  const cx = size / 2
  const cy = size / 2

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Ring */}
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r}
          fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        {/* Progress */}
        <circle cx={cx} cy={cy} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${fill.toFixed(2)} ${(circ - fill).toFixed(2)}`}
          strokeLinecap="round" />
      </svg>

      {/* Score label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--mono)', fontSize: size < 38 ? 9 : 11,
        fontWeight: 700, color, letterSpacing: '-0.02em',
      }}>
        {score}
      </div>
    </div>
  )
}
