/**
 * MODULE: conviction/technical/index.js
 * Technical scoring — 15 pts total.
 *
 * EMA200:            5 pts — price > EMA200
 * RSI:               3 pts — momentum zone
 * Relative Strength: 7 pts — outperformance vs SPY (1M/3M/6M weighted)
 *
 * All indicators calculated from Alpaca OHLCV — no external API needed.
 */

import { scoreEMA200 }          from './ema.js'
import { scoreRSI }             from './rsi.js'
import { scoreRelativeStrength } from './relativeStrength.js'

export function scoreTechnical(ctx) {
  const ema    = scoreEMA200(ctx)
  const rsi    = scoreRSI(ctx)
  const relStr = scoreRelativeStrength(ctx)

  const components = {
    ema200:          { raw: ema.score,    max: 5, ema200: ema.ema200, currentPrice: ema.currentPrice, above: ema.above },
    rsi:             { raw: rsi.score,    max: 3, rsi: rsi.rsi },
    relativeStrength:{ raw: relStr.score, max: 7, weightedRS: relStr.weightedRS, breakdown: relStr.breakdown },
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
