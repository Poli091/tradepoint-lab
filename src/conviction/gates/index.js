/**
 * MODULE: conviction/gates/index.js
 * Gate system — parallel to scoring, evaluated independently.
 *
 * Gate 1 (Knockout):  ANY failure → cap score at 35, verdict = STRONG SELL
 * Gate 2 (Quality):   ANY failure → cap score at 58, max verdict = HOLD
 *
 * Gates run in sequence: Gate 1 first, Gate 2 only if Gate 1 passes.
 * Null fields → pass by default (can't penalize for missing data).
 *
 * v1.1 changes:
 *  - Gate 2: ROE only passes when leverage is healthy (D/E ≤ sectoral max)
 *  - Gate 2: Operating Margin gate skipped for Banks/REIT (structurally inapplicable)
 */

/* ─── Gate 1 ────────────────────────────────────────────── */
function checkGate1(ctx) {
  const f = ctx.fundamentals
  const profile = ctx.sectorProfile
  const checks = {}

  // Revenue must show some positive trajectory
  const revOk = (f.revenueGrowth3Y  != null && f.revenueGrowth3Y  > 0)
             || (f.revenueGrowthYoY != null && f.revenueGrowthYoY >= 0)
             || (f.revenueGrowth3Y == null && f.revenueGrowthYoY == null)  // null → pass
  checks.revenueGrowth = { pass: revOk, value: f.revenueGrowthYoY }

  // Operating margin must not be catastrophically negative
  const opOk = f.operatingMargin == null || f.operatingMargin > -25
  checks.operatingMargin = { pass: opOk, value: f.operatingMargin }

  // D/E gate (skip for banks — their D/E is structurally incomparable)
  if (profile.name !== 'banks' && profile.gate1DebtMax != null) {
    const deOk = f.debtToEquity == null || f.debtToEquity <= profile.gate1DebtMax
    checks.debtEquity = { pass: deOk, value: f.debtToEquity, max: profile.gate1DebtMax }
  } else {
    checks.debtEquity = { pass: true, skipped: true }
  }

  const pass = Object.values(checks).every(c => c.pass)
  return { pass, cap: pass ? null : 35, verdict: pass ? null : 'STRONG SELL', checks }
}

/* ─── Gate 2 ────────────────────────────────────────────── */
function checkGate2(ctx) {
  const f = ctx.fundamentals
  const profile = ctx.sectorProfile
  const checks = {}

  // ── Profitability check ──────────────────────────────────
  // Priority: ROIC/ROI (true economic return) → ROE with leverage guard
  // ROE alone can be inflated by high leverage — only counts if D/E is healthy
  const roic = f.roic ?? f.roi ?? null
  const roe  = f.roe ?? null
  const debtToEquity = f.debtToEquity ?? null
  const debtThreshold = profile.gate1DebtMax ?? 4  // use sector-appropriate threshold

  let qualityVal, qualitySource, qualityOk

  if (roic != null) {
    // ROIC/ROI available — use directly, no leverage adjustment needed
    qualityVal    = roic
    qualitySource = f.roic != null ? 'roic' : 'roi_proxy'
    qualityOk     = qualityVal >= 8
  } else if (roe != null) {
    // ROE only — require D/E within healthy range to avoid leverage distortion
    qualityVal    = roe
    qualitySource = 'roe_with_leverage_check'
    const leverageOk = debtToEquity == null || debtToEquity <= debtThreshold
    qualityOk     = roe >= 10 && leverageOk
    // If ROE ≥ 10 but leverage is too high, note the reason
    if (roe >= 10 && !leverageOk) {
      qualitySource = 'roe_failed_leverage_check'
    }
  } else {
    // No quality metric — pass by default (can't penalize for missing data)
    qualityVal    = null
    qualitySource = null
    qualityOk     = true
  }

  checks.profitability = {
    pass: qualityOk, value: qualityVal, source: qualitySource,
    roic, roe, debtToEquity,
  }

  // ── Operating Margin check ───────────────────────────────
  // Banks and REITs: operating margin is structurally inapplicable
  // (banks use Net Interest Margin; REITs report AFFO/FFO)
  const skipOpMargin = profile.name === 'banks' || profile.name === 'reit'
  if (skipOpMargin) {
    checks.operatingMargin = { pass: true, skipped: true, reason: `Not applicable for ${profile.name}` }
  } else {
    const opOk = f.operatingMargin == null || f.operatingMargin > 0
    checks.operatingMargin = { pass: opOk, value: f.operatingMargin }
  }

  const pass = Object.values(checks).every(c => c.pass)
  return { pass, cap: pass ? null : 58, verdict: pass ? null : 'HOLD', checks }
}

/* ─── Evaluator ─────────────────────────────────────────── */
export function evaluateGates(ctx) {
  const gate1 = checkGate1(ctx)

  if (!gate1.pass) {
    return {
      gate1,
      gate2:       { pass: false, skipped: true, reason: 'Gate 1 failed' },
      activeCap:   35,
      activeGate:  'gate1',
      gateVerdict: 'STRONG SELL',
    }
  }

  const gate2 = checkGate2(ctx)

  if (!gate2.pass) {
    return {
      gate1,
      gate2,
      activeCap:   58,
      activeGate:  'gate2',
      gateVerdict: 'HOLD',
    }
  }

  return {
    gate1,
    gate2,
    activeCap:   null,
    activeGate:  null,
    gateVerdict: null,   // no cap — score determines grade freely
  }
}
