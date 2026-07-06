/**
 * MODULE: conviction/strength/index.js
 * Financial Strength scoring — 15 pts total (5 each).
 *
 * Uses sector-specific brackets from sectorProfile.
 * Banks: skipped entirely in v1.0 (confidence reduced instead).
 * Negative D/E (negative equity) → 0 pts, flagged.
 */

function scoreBracket(value, brackets) {
  if (value == null || !brackets) return null
  for (const { threshold, type, pts } of brackets) {
    if (type === 'max' && value <= threshold) return pts  // lower is better (D/E)
    if (type === 'min' && value >= threshold) return pts  // higher is better (CR, IC)
  }
  return 0
}

export function scoreStrength(ctx) {
  const f       = ctx.fundamentals
  const profile = ctx.sectorProfile

  // Banks: not scored in v1.0
  if (profile.name === 'banks') {
    return {
      score:     null,
      max:       15,
      skipped:   true,
      reason:    'Financial Strength not scored for Banks in v1.0',
      nullFields: 3,
      components: {},
    }
  }

  const b = profile.strengthBrackets

  // Handle negative D/E (negative equity = worst case)
  const deRaw = (f.debtToEquity != null && f.debtToEquity < 0)
    ? 0
    : scoreBracket(f.debtToEquity, b.debtEquity)

  const components = {
    debtEquity:       { raw: deRaw,                                          max: 5, value: f.debtToEquity },
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
