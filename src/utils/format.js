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

/** Format as compact USD for large numbers (e.g. $1.23K, $4.56M) */
export function fUSDCompact(value) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `$${(value / 1_000).toFixed(2)}K`
  return fUSD(value)
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

/** Format a date as "Jul 4" */
export function fDateShort(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
