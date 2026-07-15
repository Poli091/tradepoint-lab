/**
 * MODULE: conviction/quality/index.js
 * Quality scoring — 20 pts total.
 *
 * v1.1 — reduced double counting:
 *   ROIC/ROE (capital efficiency):   7 pts  (was 8)
 *   Operating Margin:                6 pts  (new — more direct than Net)
 *   Gross Margin:                    4 pts  (was 5)
 *   FCF Margin:                      3 pts  (new — replaces most of Net Margin)
 *   Net Margin:                      0 pts  (removed — highly correlated with Op Margin
 *                                           and distorted by tax/interest/non-op items)
 *
 * Rationale: Gross, Operating, and Net Margin are correlated.
 * Software companies were accumulating points for 3 versions of the same advantage.
 * FCF Margin replaces Net Margin as it's less affected by accounting choices.
 *
 * NULL POLICY: missing fields excluded from both numerator and denominator.
 */

function scoreROIC(v) {
  if (v == null) return null
  if (v > 20)  return 7
  if (v >= 15) return 6
  if (v >= 10) return 4
  if (v >= 8)  return 2
  return 0
}

function scoreOperatingMargin(v) {
  if (v == null) return null
  if (v > 30)  return 6
  if (v >= 20) return 5
  if (v >= 10) return 3
  if (v >= 0)  return 1
  return 0
}

function scoreGrossMargin(v) {
  if (v == null) return null
  if (v > 60)  return 4
  if (v >= 40) return 3
  if (v >= 20) return 2
  return 0
}

function scoreFCFMargin(v) {
  if (v == null) return null
  if (v > 20)  return 3
  if (v >= 10) return 2
  if (v >= 0)  return 1
  return 0
}

export function scoreQuality(ctx) {
  const f = ctx.fundamentals

  // Capital efficiency: prefer ROIC/ROI, fall back to ROE
  // Note: ROE can be inflated by leverage, but for Quality scoring
  // we use the best available metric (Gate 2 handles leverage separately)
  const qualityOptions = [f.roic, f.roi, f.roe].filter(v => v != null)
  const roicValue  = qualityOptions.length > 0 ? Math.max(...qualityOptions) : null
  const roicSource = f.roic != null ? 'roic'
                   : f.roi  != null ? 'roi_proxy'
                   : f.roe  != null ? 'roe_proxy'
                   : null

  // FCF Margin: derive from fcfTTM / revenue if not directly available
  // Finnhub provides fcfMarginTTM in metric endpoint
  const fcfMargin = f.fcfMarginTTM ?? null

  const components = {
    roic:            { raw: scoreROIC(roicValue),               max: 7, value: roicValue, source: roicSource },
    operatingMargin: { raw: scoreOperatingMargin(f.operatingMargin), max: 6, value: f.operatingMargin },
    grossMargin:     { raw: scoreGrossMargin(f.grossMargin),    max: 4, value: f.grossMargin },
    fcfMargin:       { raw: scoreFCFMargin(fcfMargin),          max: 3, value: fcfMargin },
  }

  let totalRaw = 0, totalMax = 0, nullCount = 0
  for (const comp of Object.values(components)) {
    if (comp.raw == null) { nullCount++ }
    else { totalRaw += comp.raw; totalMax += comp.max }
  }

  const score = totalMax > 0
    ? Math.round((totalRaw / totalMax) * 20 * 10) / 10
    : null

  return { score, max: 20, nullFields: nullCount, components }
}
