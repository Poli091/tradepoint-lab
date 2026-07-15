/**
 * MODULE: conviction/growth/index.js
 * Growth scoring — 25 pts total.
 *
 * Revenue Growth:      8 pts (>25%=8, 15-25%=6, 10-15%=4, 0-10%=2, <0=0)
 * EPS Growth:          8 pts (same scale)
 * FCF Growth 5Y:       5 pts (>20%=5, 10-20%=3, 0-10%=2, <0=0)
 * Acceleration Bonus:  4 pts (Revenue +2 if TTM>3Y, EPS +2 if TTM>3Y)
 *
 * v1.1 changes:
 *  - Growth metrics are winsorized (capped) to prevent anomalous spikes:
 *      Revenue Growth: capped at +60%
 *      EPS Growth:     capped at +80% (avoids near-zero base distortion)
 *      FCF Growth:     capped at +100%
 *  - EPS crossing negative→positive flagged as 'profitability_inflection'
 *    (scores neutral rather than inflated %)
 *  - Growth Quality Modifier: if operating margin contracted severely,
 *    max Growth score is reduced (capping at 85% or 65%)
 *
 * NULL POLICY: if a field is null, it is excluded from both numerator
 * and denominator. Score is normalized over available data only.
 */

/* ── Winsorize growth metrics ─────────────────────────── */
function winsorize(v, cap) {
  if (v == null) return null
  return Math.min(v, cap)
}

function scoreRevenue(v) {
  const w = winsorize(v, 60)  // cap at 60% to prevent anomalous signals
  if (w == null) return null
  if (w > 25)   return 8
  if (w >= 15)  return 6
  if (w >= 10)  return 4
  if (w >= 0)   return 2
  return 0
}

function scoreEPS(raw) {
  // Flag profitability inflection (negative → positive): score neutrally
  // to avoid inflated % from near-zero base
  if (raw == null) return null
  if (raw > 500) return 4   // almost certainly base distortion — score neutral
  const w = winsorize(raw, 80)
  if (w > 25)   return 8
  if (w >= 15)  return 6
  if (w >= 10)  return 4
  if (w >= 0)   return 2
  return 0
}

function scoreFCF(v) {
  const w = winsorize(v, 100)
  if (w == null) return null
  if (w > 20)  return 5
  if (w >= 10) return 3
  if (w >= 0)  return 2
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
  }

  // EPS: TTM vs 3Y CAGR (skip if TTM is anomalous)
  if (f.epsGrowthYoY != null && f.epsGrowth3Y != null && Math.abs(f.epsGrowthYoY) <= 500) {
    maxPts += 2
    const gap = f.epsGrowthYoY - f.epsGrowth3Y
    if (gap > 5)       pts += 2
    else if (gap > -5) pts += 1
  }

  if (maxPts === 0) return { raw: null, max: 4 }
  const normalized = maxPts < 4 ? (pts / maxPts) * 4 : pts
  return { raw: Math.round(normalized * 10) / 10, max: 4 }
}

/* ── Growth Quality Modifier ─────────────────────────────
 * Reduces Growth score when revenue grows but profitability deteriorates severely.
 * Intent: penalize companies buying growth at the cost of margins.
 *
 * NON-DUPLICATION DESIGN:
 *   Growth modifier → measures DIRECTION/DETERIORATION of margin (not level)
 *   Quality        → measures CURRENT LEVEL of margins
 *   Gate 2         → only activates when margin crosses ≤ 0
 *   Risk           → penalizes volatility, not margin level directly
 *
 * Thresholds (gross-to-operating spread proxy for margin deterioration):
 *   spread > 40pp AND opMargin < 0   → severe   → cap Growth at 65%
 *   spread > 30pp AND opMargin < 5%  → moderate → cap Growth at 85%
 *   otherwise                         → no adjustment
 *
 * Note: spread = grossMargin - operatingMargin measures SG&A + R&D burden.
 * High spread + negative opMargin = heavy investment spending erasing profitability.
 */
function growthQualityModifier(f) {
  if (f.operatingMargin == null || f.grossMargin == null) return 1.0
  const spread = f.grossMargin - f.operatingMargin
  if (spread > 40 && f.operatingMargin < 0)   return 0.65  // severe: >40pp spread + negative opMargin
  if (spread > 30 && f.operatingMargin < 5)   return 0.85  // moderate: >30pp spread + thin opMargin
  return 1.0
}

export function scoreGrowth(ctx) {
  const f = ctx.fundamentals

  const accel = calcAcceleration(f)
  const modifier = growthQualityModifier(f)

  const components = {
    revenue:      { raw: scoreRevenue(f.revenueGrowthYoY), max: 8, value: f.revenueGrowthYoY,
                    capped: f.revenueGrowthYoY > 60 },
    eps:          { raw: scoreEPS(f.epsGrowthYoY),          max: 8, value: f.epsGrowthYoY,
                    anomalous: f.epsGrowthYoY > 500 },
    fcf:          { raw: scoreFCF(f.fcfGrowth5Y),            max: 5, value: f.fcfGrowth5Y },
    acceleration: { raw: accel.raw,                          max: 4 },
  }

  let totalRaw = 0, totalMax = 0, nullCount = 0
  for (const comp of Object.values(components)) {
    if (comp.raw == null) { nullCount++ }
    else { totalRaw += comp.raw; totalMax += comp.max }
  }

  const baseScore = totalMax > 0
    ? Math.round((totalRaw / totalMax) * 25 * 10) / 10
    : null

  // Apply growth quality modifier
  const score = baseScore != null
    ? Math.round(baseScore * modifier * 10) / 10
    : null

  return {
    score, max: 25, nullFields: nullCount, components,
    growthQualityModifier: modifier,
  }
}
