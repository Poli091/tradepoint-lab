/**
 * MODULE: conviction/strength/index.js
 * Financial Strength scoring — 15 pts total.
 *
 * v1.1 — D/E negative handling corrected:
 *   Negative D/E = negative equity (denominator < 0)
 *   This is NOT "net cash" — cannot be inferred from D/E alone.
 *   Negative equity + any debt → 0 pts, flag "negative_equity"
 *   Negative equity + confirmed net cash (would need totalDebt/cash fields) → skip
 *   Since Finnhub doesn't expose totalDebt/cashEquiv directly in free metrics,
 *   we conservatively score D/E = 0 pts when negative equity is present,
 *   and rely on Current Ratio and Interest Coverage for the strength signal.
 *
 * Banks: not scored (D/E, CR, IC structurally incomparable).
 */

function scoreBracket(value, brackets) {
  if (value == null || !brackets) return null
  for (const { threshold, type, pts } of brackets) {
    if (type === 'max' && value <= threshold) return pts
    if (type === 'min' && value >= threshold) return pts
  }
  return 0
}

export function scoreStrength(ctx) {
  const f       = ctx.fundamentals
  const profile = ctx.sectorProfile

  if (profile.name === 'banks') {
    return {
      score: null, max: 15, skipped: true,
      reason: 'Financial Strength not scored for Banks in v1.1',
      nullFields: 3, components: {},
    }
  }

  const b = profile.strengthBrackets

  // ── D/E handling ─────────────────────────────────────────
  // Negative D/E = negative equity (equity < 0).
  // This is a red flag — cannot assume "net cash" without totalDebt/cash data.
  // Score 0 pts and flag; other components (CR, IC) carry the remaining signal.
  let debtScore, negativeEquityFlag = false
  if (f.debtToEquity == null) {
    debtScore = null  // missing → normalize out
  } else if (f.debtToEquity < 0) {
    debtScore = 0
    negativeEquityFlag = true
  } else {
    debtScore = scoreBracket(f.debtToEquity, b.debtEquity)
  }

  const components = {
    debtEquity: {
      raw: debtScore, max: 5, value: f.debtToEquity,
      flag: negativeEquityFlag ? 'negative_equity' : undefined,
    },
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

  return { score, max: 15, nullFields: nullCount, components, negativeEquity: negativeEquityFlag }
}
