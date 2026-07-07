/**
 * MODULE: conviction/risk/index.js
 * Risk penalties — max -10 pts, never positive.
 *
 * Two categories (as per SPEC):
 *
 * UNIVERSAL (sector-independent):
 *   beta_high          Beta > 2.0        → -2
 *   margin_negative    Net Margin < -10% → -3
 *
 * FINANCIAL (sector-aware — uses sectorProfile.riskDebtMax):
 *   debt_extreme       D/E > sectorProfile.riskDebtMax → -3
 *     Default:   > 3.0  (gate1DebtMax = 4.0)
 *     Utilities: > 5.0  (gate1DebtMax = 6.0)
 *     REIT:      > 8.0  (gate1DebtMax = 10.0)
 *     Banks:     skipped (riskDebtMax = null)
 *
 * This makes Risk internally consistent with Gate1 and Strength:
 * the same D/E value cannot be "acceptable" in Gate1 while
 * simultaneously triggering a Risk penalty.
 */

export function scoreRisk(ctx) {
  const f       = ctx.fundamentals
  const profile = ctx.sectorProfile

  const triggered = []
  let total = 0

  /* ── Universal risk rules ─────────────────────────────── */

  // Beta > 2.0 — high market volatility (universal, applies to all sectors)
  if (f.beta != null && f.beta > 2.0) {
    triggered.push({ flag: 'beta_high', label: `Beta > 2.0 — high volatility vs market (β=${f.beta?.toFixed(2)})`, value: f.beta, penalty: -2 })
    total -= 2
  }

  // Net margin persistently negative (universal — bad in any sector)
  if (f.netMargin != null && f.netMargin < -10) {
    triggered.push({ flag: 'margin_negative', label: `Net Margin persistently negative (${f.netMargin?.toFixed(1)}%)`, value: f.netMargin, penalty: -3 })
    total -= 3
  }

  /* ── Financial risk rules (sector-aware) ─────────────── */

  // D/E — threshold from sector profile (null = skip for banks)
  const debtMax = profile.riskDebtMax   // e.g. 3.0 default, 5.0 utilities, null banks
  if (debtMax != null && f.debtToEquity != null && f.debtToEquity > debtMax) {
    triggered.push({
      flag:    'debt_extreme',
      label:   `Debt/Equity > ${debtMax} — excessive leverage for ${profile.name} sector (D/E=${f.debtToEquity?.toFixed(2)})`,
      value:   f.debtToEquity,
      penalty: -3,
    })
    total -= 3
  }

  // Cap at -10
  const penalty = Math.max(total, -10)

  return {
    penalty,
    max:       0,
    flags:     triggered.map(t => t.flag),
    breakdown: triggered,
  }
}
