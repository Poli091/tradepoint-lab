/**
 * EMA200 calculation and scoring (5 pts).
 * Price > EMA200 → 5 pts | Price < EMA200 → 0 pts
 *
 * EMA uses Wilder's exponential smoothing starting from a simple average.
 * Requires at least `period` data points to compute.
 */

/**
 * Calculate EMA from an array of close prices (oldest → newest).
 * @param {number[]} closes
 * @param {number} period
 * @returns {number|null}
 */
export function calcEMA(closes, period) {
  if (!closes || closes.length < period) return null
  const k = 2 / (period + 1)
  // Seed with simple average of first `period` values
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k)
  }
  return Math.round(ema * 100) / 100
}

export function scoreEMA200(ctx) {
  const { ohlcv, prices, fundamentals } = ctx
  const ticker = fundamentals.ticker

  if (!ohlcv || ohlcv.length < 20) {
    return { score: null, ema200: null, currentPrice: null, above: null }
  }

  const closes      = ohlcv.map(d => d.price)
  const period      = Math.min(200, closes.length)
  const ema200      = calcEMA(closes, period)
  const currentPrice = prices[ticker]?.price ?? closes[closes.length - 1]

  if (!ema200) return { score: null, ema200: null, currentPrice, above: null }

  const above = currentPrice > ema200
  return {
    score:        above ? 5 : 0,
    ema200,
    currentPrice,
    above,
    periodUsed:   period,    // <200 if insufficient data (noted in confidence)
  }
}
