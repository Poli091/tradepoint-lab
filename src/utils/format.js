/**
 * MODULE: UTILS / format.js
 * Pure formatting helpers — no side effects.
 */

/** Format as USD with full precision (e.g. $1,234.56) */
export function fUSD(value) {
  return '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Format as percentage with optional + sign (e.g. +3.45% or -1.20%) */
export function fPct(value, showSign = true) {
  const sign = showSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/** Format as signed USD (e.g. +$1,234.56 or -$234.00) */
export function fSignedUSD(value) {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${fUSD(value)}`
}



/** Format a decimal as signed percentage: 0.122 → "+12.2%" */
export function fPctVal(v) {
  if (v == null) return '—'
  const pct = v * 100
  return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%'
}

/** Format as multiple: 42.1 → "42.1×" */
export function fMult(v) {
  if (v == null) return '—'
  return v.toFixed(1) + '×'
}

/** Format large number as compact: 45000000000 → "$45.0B" */
export function fBig(v) {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`
  if (abs >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`
  return `$${v.toFixed(0)}`
}

/** Format a plain ratio: 4.17 → "4.2" */
export function fRatio(v, decimals = 1) {
  if (v == null) return '—'
  return v.toFixed(decimals)
}
