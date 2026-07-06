/**
 * MODULE: conviction/risk/index.js
 * Risk penalties — max -10 pts, never positive.
 *
 * A company with no risk flags gets 0 penalty (not "10/10 risk score").
 * Penalties stack but are capped at -10 total.
 *
 * Current flags:
 *   beta_high          Beta > 2.0        → -2
 *   debt_extreme       D/E > 3.0         → -3
 *   margin_negative    Net Margin < -10% → -3
 */

const RISK_RULES = [
  {
    flag:      'beta_high',
    test:      (f) => f.beta != null && f.beta > 2.0,
    penalty:   -2,
    label:     'Beta > 2.0 — high volatility vs market',
    value:     (f) => f.beta,
  },
  {
    flag:      'debt_extreme',
    test:      (f) => f.debtToEquity != null && f.debtToEquity > 3.0,
    penalty:   -3,
    label:     'Debt/Equity > 3.0 — excessive leverage',
    value:     (f) => f.debtToEquity,
  },
  {
    flag:      'margin_negative',
    test:      (f) => f.netMargin != null && f.netMargin < -10,
    penalty:   -3,
    label:     'Net Margin persistently negative (< -10%)',
    value:     (f) => f.netMargin,
  },
]

export function scoreRisk(ctx) {
  const f = ctx.fundamentals
  const triggered = []
  let total = 0

  for (const rule of RISK_RULES) {
    if (rule.test(f)) {
      triggered.push({ flag: rule.flag, label: rule.label, value: rule.value(f), penalty: rule.penalty })
      total += rule.penalty
    }
  }

  // Cap at -10
  const penalty = Math.max(total, -10)

  return {
    penalty,
    max:       0,    // risk never adds positive points
    flags:     triggered.map(t => t.flag),
    breakdown: triggered,
  }
}
