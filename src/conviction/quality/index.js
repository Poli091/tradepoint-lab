/**
 * MODULE: conviction/quality/index.js
 * Quality scoring — 20 pts total.
 *
 * ROIC (8):        >20%=8, 15-20%=6, 10-15%=4, 8-10%=2, <8%=0
 * Net Margin (7):  >25%=7, 15-25%=5, 10-15%=3, 0-10%=1, <0%=0
 * Gross Margin (5):>60%=5, 40-60%=3, 20-40%=2, <20%=0
 *
 * ROIC: uses roic field; falls back to roi (ROI ≈ ROIC proxy)
 * Values are in % form (20 = 20%) as returned by Finnhub.
 */

function scoreROIC(v) {
  if (v == null) return null
  if (v > 20)  return 8
  if (v >= 15) return 6
  if (v >= 10) return 4
  if (v >= 8)  return 2
  return 0
}

function scoreNetMargin(v) {
  if (v == null) return null
  if (v > 25)  return 7
  if (v >= 15) return 5
  if (v >= 10) return 3
  if (v >= 0)  return 1
  return 0
}

function scoreGrossMargin(v) {
  if (v == null) return null
  if (v > 60)  return 5
  if (v >= 40) return 3
  if (v >= 20) return 2
  return 0
}

export function scoreQuality(ctx) {
  const f = ctx.fundamentals

  // Use the BEST available quality metric — same logic as Gate 2.
  // Avoids using ROI (-0.9%) when ROE (43%) is available and healthier.
  const qualityOptions = [f.roic, f.roi, f.roe].filter(v => v != null)
  const roicValue  = qualityOptions.length > 0 ? Math.max(...qualityOptions) : null
  const roicSource = f.roic != null ? 'roic' : f.roi != null ? 'roi_proxy' : f.roe != null ? 'roe_proxy' : null

  const components = {
    roic:        { raw: scoreROIC(roicValue),            max: 8, value: roicValue, source: roicSource },
    netMargin:   { raw: scoreNetMargin(f.netMargin),     max: 7, value: f.netMargin },
    grossMargin: { raw: scoreGrossMargin(f.grossMargin), max: 5, value: f.grossMargin },
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
