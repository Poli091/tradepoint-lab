/**
 * Relative Strength vs SPY — 7 pts.
 *
 * RS = Ticker Return − SPY Return  (for each period)
 * Weighted average: 1M×1 + 3M×2 + 6M×1.5  (3M has highest weight)
 *
 * Scoring:
 *  RS > 15%    7 pts
 *  RS > 10%    6 pts
 *  RS > 5%     5 pts
 *  RS > 0%     4 pts
 *  RS > -5%    2 pts
 *  RS > -10%   1 pt
 *  RS ≤ -10%   0 pts
 *
 * Calculated from Alpaca OHLCV — consistent with all other technical indicators.
 */

const PERIODS = [
  { days: 21,  weight: 1,   label: '1M' },
  { days: 63,  weight: 2,   label: '3M' },
  { days: 126, weight: 1.5, label: '6M' },
]

function periodReturn(ohlcv, days) {
  if (!ohlcv || ohlcv.length < days) return null
  const slice = ohlcv.slice(-days)
  const first = slice[0]?.price
  const last  = slice[slice.length - 1]?.price
  if (!first || !last || first === 0) return null
  return ((last - first) / first) * 100
}

export function scoreRelativeStrength(ctx) {
  const { ohlcv, spyOhlcv } = ctx

  let totalWeight = 0, weightedRS = 0
  const breakdown = {}

  for (const { days, weight, label } of PERIODS) {
    const tickerReturn = periodReturn(ohlcv, days)
    const spyReturn    = periodReturn(spyOhlcv, days)

    if (tickerReturn != null && spyReturn != null) {
      const rs = tickerReturn - spyReturn
      breakdown[label] = {
        tickerReturn: Math.round(tickerReturn * 100) / 100,
        spyReturn:    Math.round(spyReturn    * 100) / 100,
        rs:           Math.round(rs           * 100) / 100,
      }
      weightedRS  += rs * weight
      totalWeight += weight
    }
  }

  if (totalWeight === 0) return { score: null, weightedRS: null, breakdown }

  const avgRS = Math.round((weightedRS / totalWeight) * 100) / 100

  let score = 0
  if      (avgRS > 15)  score = 7
  else if (avgRS > 10)  score = 6
  else if (avgRS > 5)   score = 5
  else if (avgRS > 0)   score = 4
  else if (avgRS > -5)  score = 2
  else if (avgRS > -10) score = 1

  return { score, weightedRS: avgRS, breakdown }
}
