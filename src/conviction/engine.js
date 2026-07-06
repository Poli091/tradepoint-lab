/**
 * MODULE: conviction/engine.js
 * Main orchestrator — extremely simple by design.
 *
 * Pipeline:
 *   createContext → 5 scorers + risk → rawScore
 *   → riskPenalty → scoreAfterRisk
 *   → gates (parallel) → gateCap → finalScore
 *   → confidence → grade → audit → return
 *
 * Each module has a single responsibility.
 * Gates run independently of scoring — they can be analyzed separately.
 */

import { createContext }     from './context.js'
import { scoreGrowth }       from './growth/index.js'
import { scoreQuality }      from './quality/index.js'
import { scoreStrength }     from './strength/index.js'
import { scoreValuation }    from './valuation/index.js'
import { scoreTechnical }    from './technical/index.js'
import { scoreRisk }         from './risk/index.js'
import { evaluateGates }     from './gates/index.js'
import { calcConfidence }    from './confidence/index.js'
import { getGrade }          from './grade/index.js'
import { buildAudit }        from './audit/index.js'

/**
 * @param {object} fundamentals  - from Worker /api/fundamentals/:ticker
 * @param {object[]} ohlcv       - from Worker /api/ohlcv/:ticker/1Y
 * @param {object[]} spyOhlcv    - from Worker /api/ohlcv/SPY/1Y
 * @param {object} prices        - { [ticker]: { price, ... } }
 * @returns Full conviction result object
 */
export function runConviction({ fundamentals, ohlcv = [], spyOhlcv = [], prices = {} }) {
  // ── 1. Build shared context ──────────────────────────────
  const ctx = createContext({ fundamentals, ohlcv, spyOhlcv, prices })

  // ── 2. Score each dimension independently ────────────────
  const growth    = scoreGrowth(ctx)
  const quality   = scoreQuality(ctx)
  const strength  = scoreStrength(ctx)
  const valuation = scoreValuation(ctx)
  const technical = scoreTechnical(ctx)
  const risk      = scoreRisk(ctx)
  const scores    = { growth, quality, strength, valuation, technical, risk }

  // ── 3. Raw score (positive dimensions, no risk yet) ──────
  const positiveScores = [growth, quality, strength, valuation, technical]
  const rawScore = Math.round(
    positiveScores.reduce((sum, s) => sum + (s.score ?? 0), 0) * 10
  ) / 10

  // ── 4. Apply risk penalty ────────────────────────────────
  const riskPenalty    = risk.penalty  // ≤ 0
  const scoreAfterRisk = Math.max(0, Math.round((rawScore + riskPenalty) * 10) / 10)

  // ── 5. Evaluate gates (parallel system) ──────────────────
  const gates = evaluateGates(ctx)

  // ── 6. Apply gate cap → final score ─────────────────────
  const finalScore = gates.activeCap != null
    ? Math.min(scoreAfterRisk, gates.activeCap)
    : scoreAfterRisk

  // ── 7. Confidence ────────────────────────────────────────
  const confidence = calcConfidence(scores, ctx)

  // ── 8. Grade ─────────────────────────────────────────────
  const grade = getGrade(finalScore)

  // ── 9. Wall Street consensus ─────────────────────────────
  const livePrice  = prices[fundamentals.ticker]?.price
  const wallStreet = {
    targetMean:   fundamentals.targetMean   ?? null,
    targetHigh:   fundamentals.targetHigh   ?? null,
    targetLow:    fundamentals.targetLow    ?? null,
    targetMedian: fundamentals.targetMedian ?? null,
    upside: (fundamentals.targetMean && livePrice)
      ? Math.round(((fundamentals.targetMean / livePrice) - 1) * 1000) / 10
      : null,
    analysts:  (fundamentals.strongBuy ?? 0) + (fundamentals.buy ?? 0)
             + (fundamentals.hold     ?? 0) + (fundamentals.sell     ?? 0)
             + (fundamentals.strongSell ?? 0),
    strongBuy:    fundamentals.strongBuy    ?? 0,
    buy:          fundamentals.buy          ?? 0,
    hold:         fundamentals.hold         ?? 0,
    sell:         fundamentals.sell         ?? 0,
    strongSell:   fundamentals.strongSell   ?? 0,
    consecutiveBeats: fundamentals.consecutiveBeats ?? 0,
    lastEpsSurprise:  fundamentals.epsSurprisePct   ?? null,
  }

  // ── 10. Technical snapshot ───────────────────────────────
  const techComp = technical.components
  const technicalSnapshot = {
    ema200:              techComp.ema200?.ema200,
    currentPrice:        techComp.ema200?.currentPrice,
    aboveEMA200:         techComp.ema200?.above,
    rsi:                 techComp.rsi?.rsi,
    relStrength1M:       techComp.relativeStrength?.breakdown?.['1M']?.rs,
    relStrength3M:       techComp.relativeStrength?.breakdown?.['3M']?.rs,
    relStrength6M:       techComp.relativeStrength?.breakdown?.['6M']?.rs,
    relStrengthWeighted: techComp.relativeStrength?.weightedRS,
  }

  // ── 11. Audit ────────────────────────────────────────────
  const audit = buildAudit(ctx)

  // ── 12. Return full result ───────────────────────────────
  return {
    ticker:       fundamentals.ticker,

    // Score pipeline (preserved for backtesting)
    rawScore,
    riskPenalty,
    scoreAfterRisk,
    gateCap:      gates.activeCap,
    activeGate:   gates.activeGate,
    finalScore,

    // Verdict
    grade:        grade.label,
    gradeStars:   grade.stars,
    gradeColor:   grade.color,
    gradeBg:      grade.bg,
    confidence,

    // Detailed breakdown
    breakdown: {
      growth:    { score: growth.score,    max: 25, components: growth.components,    nullFields: growth.nullFields },
      quality:   { score: quality.score,   max: 20, components: quality.components,   nullFields: quality.nullFields },
      strength:  { score: strength.score,  max: 15, components: strength.components,  nullFields: strength.nullFields, skipped: strength.skipped },
      valuation: { score: valuation.score, max: 15, metric: valuation.metric, value: valuation.value },
      technical: { score: technical.score, max: 15, components: technical.components, nullFields: technical.nullFields },
      risk:      { penalty: riskPenalty, flags: risk.flags, breakdown: risk.breakdown },
    },

    // Gates (parallel to score)
    gates: {
      gate1: gates.gate1,
      gate2: gates.gate2,
    },

    // Wall Street
    wallStreet,

    // Technical snapshot
    technical: technicalSnapshot,

    // Audit
    audit,
    sectorProfile: ctx.sectorProfile.name,
    fundamentalsData: ctx.fundamentals,  // exposed for UI display
  }
}
