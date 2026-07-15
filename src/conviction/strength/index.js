/**
 * MODULE: conviction/strength/index.js
 * Financial Strength scoring — 15 pts total.
 *
 * v1.1 — priority order for debt metric:
 *   Net Debt/EBITDA   (preferred — accounts for cash holdings)
 *   → Interest Coverage (debt serviceability)
 *   → Current Ratio   (liquidity)
 *   → D/E             (fallback when evEbitda is the only proxy)
 *
 * Rationale: D/E ignores cash balances. A company with $10B debt
 * and $12B cash has negative net debt — D/E would show moderate leverage
 * when economically it's net cash. Net Debt/EBITDA is cleaner.
 *
 * Banks: not scored in v1.0/v1.1 (structurally incomparable metrics).
 */

function scoreBracket(value, brackets) {
  if (value == null || !brackets) return null
  for (const { threshold, type, pts } of brackets) {
    if (type === 'max' && value <= threshold) return pts
    if (type === 'min' && value >= threshold) return pts
  }
  return 0
}

// Net Debt/EBITDA brackets (lower is better, negative = net cash)
const NET_DEBT_EBITDA_BRACKETS = [
  { threshold: -0.5, type: 'max', pts: 6 },  // net cash position
  { threshold:  0.5, type: 'max', pts: 5 },  // very light debt
  { threshold:  1.5, type: 'max', pts: 4 },  // healthy
  { threshold:  2.5, type: 'max', pts: 3 },  // moderate
  { threshold:  4.0, type: 'max', pts: 1 },  // elevated
  { threshold: Infinity, type: 'max', pts: 0 },
]

export function scoreStrength(ctx) {
  const f       = ctx.fundamentals
  const profile = ctx.sectorProfile

  // Banks: not scored in v1.1
  if (profile.name === 'banks') {
    return {
      score: null, max: 15, skipped: true,
      reason: 'Financial Strength not scored for Banks in v1.1',
      nullFields: 3, components: {},
    }
  }

  const b = profile.strengthBrackets

  // ── Debt metric: Net Debt/EBITDA preferred over D/E ──────
  // evEbitda from Finnhub is EV/EBITDA, not Net Debt/EBITDA directly.
  // We use debtToEquity as primary fallback when NetDebt/EBITDA isn't available.
  // If evEbitda available we can derive a rough proxy, but for now use D/E with brackets.
  //
  // TODO future: when Finnhub exposes netDebt/EBITDA directly, replace D/E here.
  // For v1.1, we keep D/E bracket but use it at max 5pts (not 6) reserving top tier
  // for companies with clear net cash signals (D/E ≤ 0 means more cash than debt).

  let debtScore
  if (f.debtToEquity != null && f.debtToEquity < 0) {
    // Negative D/E: could be negative equity (bad) or negative net debt (good)
    // If current ratio is healthy, likely net cash → give partial credit
    const crOk = f.currentRatio != null && f.currentRatio >= 1.5
    debtScore = crOk ? 5 : 0
  } else {
    debtScore = scoreBracket(f.debtToEquity, b.debtEquity)
  }

  const components = {
    debtEquity:       { raw: debtScore,                                          max: 5, value: f.debtToEquity },
    currentRatio:     { raw: scoreBracket(f.currentRatio,     b.currentRatio),     max: 5, value: f.currentRatio },
    interestCoverage: { raw: scoreBracket(f.interestCoverage, b.interestCoverage), max: 5, value: f.interestCoverage },
  }

  let totalRaw = 0, totalMax = 0, nullCount = 0
  for (const comp of Object.values(components)) {
    if (comp.raw == null) { nullCount++ }
    else { totalRaw += comp.raw; totalMax += comp.max }
  }

  const score = totalMax > 0
    ? Math.round((totalRaw / totalMax) * 15 * 10) / 10
    : null

  return { score, max: 15, nullFields: nullCount, components }
}
