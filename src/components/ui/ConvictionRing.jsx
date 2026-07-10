/**
 * MODULE: UI / ConvictionRing.jsx
 * Circular SVG progress ring showing the conviction score (0–100).
 * Grade colors sourced from conviction/grade/index.js — single source of truth.
 * NOTE: SVG stroke requires hex values (CSS vars not supported in SVG attributes).
 */

import { getGradeColor } from '../../conviction/grade/index.js'

function legacyColor(score) {
  return score >= 85 ? '#22C55E'
       : score >= 70 ? '#86EFAC'
       : score >= 55 ? '#FBBF24'
       : score >= 40 ? '#F97316'
       : '#EF4444'
}

export default function ConvictionRing({ score, grade, loading = false, size = 42 }) {
  const strokeWidth = 3.5
  const r    = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const cx   = size / 2
  const cy   = size / 2

  // Single source: getGradeColor from grade/index.js
  const color = grade ? getGradeColor(grade) : legacyColor(score ?? 0)

  if (loading) {
    return (
      <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
        <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--accent)" strokeWidth={strokeWidth}
            strokeDasharray={`${(circ*0.25).toFixed(2)} ${(circ*0.75).toFixed(2)}`}
            strokeLinecap="round"
            style={{ animation:'tp-ring-spin 1s linear infinite', transformOrigin:`${cx}px ${cy}px` }} />
        </svg>
        <style>{`@keyframes tp-ring-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (score == null) {
    return (
      <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
        <svg width={size} height={size}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:'var(--mono)', fontSize:9, color:'var(--txt-muted)' }}>—</div>
      </div>
    )
  }

  const fill = Math.max(0, Math.min(score / 100, 1)) * circ

  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${fill.toFixed(2)} ${(circ-fill).toFixed(2)}`}
          strokeLinecap="round" />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'var(--mono)', fontSize: size < 38 ? 9 : 11,
        fontWeight:700, color, letterSpacing:'-0.02em' }}>
        {Math.round(score)}
      </div>
    </div>
  )
}
