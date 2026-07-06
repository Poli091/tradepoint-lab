/**
 * MODULE: conviction/growth/index.js
 * Growth scoring — 25 pts total.
 *
 * Revenue Growth:      8 pts (>25%=8, 15-25%=6, 10-15%=4, 0-10%=2, <0=0)
 * EPS Growth:          8 pts (same scale)
 * FCF Growth 5Y:       5 pts (>20%=5, 10-20%=3, 0-10%=2, <0=0)
 * Acceleration Bonus:  4 pts (Revenue +2 if TTM>3Y, EPS +2 if TTM>3Y)
 *
 * NULL POLICY: if a field is null, it is excluded from both numerator
 * and denominator. Score is normalized over available data only.
 * Confidence decreases for each null field.
 */

function scoreRevenue(v) {
  if (v == null) return null
  if (v > 25)   return 8
  if (v >= 15)  return 6
  if (v >= 10)  return 4
  if (v >= 0)   return 2
  return 0
}

// EPS uses the same scale as Revenue
const scoreEPS = scoreRevenue

function scoreFCF(v) {
  if (v == null) return null
  if (v > 20)  return 5
  if (v >= 10) return 3
  if (v >= 0)  return 2
  return 0
}

function calcAcceleration(f) {
  let pts = 0, maxPts = 0

  // Revenue: TTM vs 3Y CAGR
  if (f.revenueGrowthYoY != null && f.revenueGrowth3Y != null) {
    maxPts += 2
    const gap = f.revenueGrowthYoY - f.revenueGrowth3Y
    if (gap > 5)       pts += 2   // TTM clearly accelerating
    else if (gap > -5) pts += 1   // TTM similar (no clear decel)
    // else 0 (clear deceleration)
  }

  // EPS: TTM vs 3Y CAGR
  if (f.epsGrowthYoY != null && f.epsGrowth3Y != null) {
    maxPts += 2
    const gap = f.epsGrowthYoY - f.epsGrowth3Y
    if (gap > 5)       pts += 2
    else if (gap > -5) pts += 1
  }

  if (maxPts === 0) return { raw: null, max: 4 }

  // Normalize to 4 pts if partial data
  const normalized = maxPts < 4 ? (pts / maxPts) * 4 : pts
  return { raw: Math.round(normalized * 10) / 10, max: 4 }
}

export function scoreGrowth(ctx) {
  const f = ctx.fundamentals

  const accel = calcAcceleration(f)

  const components = {
    revenue:      { raw: scoreRevenue(f.revenueGrowthYoY), max: 8, value: f.revenueGrowthYoY },
    eps:          { raw: scoreEPS(f.epsGrowthYoY),          max: 8, value: f.epsGrowthYoY },
    fcf:          { raw: scoreFCF(f.fcfGrowth5Y),            max: 5, value: f.fcfGrowth5Y },
    acceleration: { raw: accel.raw,                          max: 4 },
  }

  // Normalize over available components only
  let totalRaw = 0, totalMax = 0, nullCount = 0
  for (const comp of Object.values(components)) {
    if (comp.raw == null) { nullCount++ }
    else { totalRaw += comp.raw; totalMax += comp.max }
  }

  const score = totalMax > 0
    ? Math.round((totalRaw / totalMax) * 25 * 10) / 10
    : null

  return { score, max: 25, nullFields: nullCount, components }
}
