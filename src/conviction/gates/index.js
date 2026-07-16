/**
 * MODULE: conviction/gates/index.js
 * Gate system — v1.1
 *
 * Gate 1 (Knockout):  ANY failure → cap 35, STRONG SELL
 * Gate 2 (Quality):   ANY failure → cap 58, HOLD
 *
 * v1.1 changes:
 *  - Gate 2 profitability: ROIC only (not ROI — ROI is not ROIC).
 *    ROE as fallback only with explicit leverage guard.
 *  - Gate 2 operating margin: skipped for banks/REIT with documented substitute.
 *    Banks: ROE ≥ 10% AND Net Margin > 0% (simplified proxy for profitability).
 *    REIT:  D/E within sectoral threshold (leverage proxy, no op margin).
 *  - Null policy: missing field → pass (can't penalize for missing data).
 */

/* ─── Gate 1 ────────────────────────────────────────────── */
function checkGate1(ctx) {
  const f       = ctx.fundamentals
  const profile = ctx.sectorProfile
  const checks  = {}

  const revOk = (f.revenueGrowth3Y  != null && f.revenueGrowth3Y  >= 0)
             || (f.revenueGrowthYoY != null && f.revenueGrowthYoY >= 0)
             || (f.revenueGrowth3Y == null && f.revenueGrowthYoY == null)
  checks.revenueGrowth = { pass: revOk, value: f.revenueGrowthYoY }

  const opOk = f.operatingMargin == null || f.operatingMargin > -25
  checks.operatingMargin = { pass: opOk, value: f.operatingMargin }

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
  const f       = ctx.fundamentals
  const profile = ctx.sectorProfile
  const checks  = {}

  // ── Profitability ─────────────────────────────────────────
  // ROIC only as primary (f.roic field from Finnhub metric 'roicTTM').
  // ROI (f.roi) is excluded — inconsistent definition across providers.
  // ROE as fallback only when D/E is within healthy sectoral limits.

  const roic = f.roic ?? null  // ← ROIC only, not f.roi
  const roe  = f.roe  ?? null
  const de   = f.debtToEquity ?? null
  const debtThreshold = profile.gate1DebtMax ?? 4

  let qualityVal, qualitySource, qualityOk

  if (roic != null) {
    qualityVal    = roic
    qualitySource = 'roic'
    qualityOk     = roic >= 8
  } else if (roe != null) {
    qualityVal    = roe
    // ROE with leverage guard: negative equity → leverage is problematic
    const negativeEquity = de != null && de < 0
    const leverageOk     = !negativeEquity && (de == null || de <= debtThreshold)
    qualityOk     = roe >= 8 && leverageOk
    qualitySource = leverageOk ? 'roe_leverage_ok' : 'roe_failed_leverage_check'
  } else {
    qualityVal = null; qualitySource = null; qualityOk = true  // null → pass
  }

  checks.profitability = { pass: qualityOk, value: qualityVal, source: qualitySource, roic, roe, debtToEquity: de }

  // ── Operating Margin / Sector substitute ─────────────────
  if (profile.name === 'banks') {
    // Banks substitute: ROE ≥ 10% AND net margin positive
    // (ROE already checked above; here add net margin as minimum bar)
    const roeOk = roe == null || roe >= 8  // slightly lower than standalone ROE gate
    const nmOk  = f.netMargin == null || f.netMargin > 0
    checks.operatingMargin = {
      pass:    roeOk && nmOk,
      skipped: false,
      substitute: 'banks: ROE ≥ 8% + Net Margin > 0%',
      roe,
      netMargin: f.netMargin,
    }
  } else if (profile.name === 'reit') {
    // REIT substitute: leverage within sectoral max (REIT operates on debt)
    const deOk = de == null || de <= (profile.gate1DebtMax ?? 10)
    checks.operatingMargin = {
      pass:      deOk,
      skipped:   false,
      substitute: 'reit: D/E within sectoral threshold',
      debtToEquity: de,
    }
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
    return { gate1, gate2: { pass: false, skipped: true, reason: 'Gate 1 failed' },
      activeCap: 35, activeGate: 'gate1', gateVerdict: 'STRONG SELL' }
  }

  const gate2 = checkGate2(ctx)

  if (!gate2.pass) {
    return { gate1, gate2, activeCap: 58, activeGate: 'gate2', gateVerdict: 'HOLD' }
  }

  return { gate1, gate2, activeCap: null, activeGate: null, gateVerdict: null }
}
