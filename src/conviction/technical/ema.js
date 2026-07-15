/**
 * EMA200 calculation and scoring (5 pts).
 *
 * v1.1: extension penalty added.
 * Base: Price > EMA200 → 5 pts | Price < EMA200 → 0 pts
 * Extension guard: if price is extremely extended above EMA50
 * (> 2.5 ATR), reduce score by 1 pt — avoids max technical score
 * on parabolic moves likely to consolidate.
 *
 * EMA uses Wilder's exponential smoothing starting from a simple average.
 */

export function calcEMA(closes, period) {
  if (!closes || closes.length < period) return null
  const k = 2 / (period + 1)
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k)
  }
  return Math.round(ema * 100) / 100
}

function calcATR(ohlcv, period = 14) {
  if (!ohlcv || ohlcv.length < period + 1) return null
  const trs = []
  for (let i = 1; i < ohlcv.length; i++) {
    const high  = ohlcv[i].high  ?? ohlcv[i].price
    const low   = ohlcv[i].low   ?? ohlcv[i].price
    const prev  = ohlcv[i-1].price
    if (high == null || low == null || prev == null) continue
    trs.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)))
  }
  if (trs.length < period) return null
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period
}

export function scoreEMA200(ctx) {
  const { ohlcv, prices, fundamentals } = ctx
  const ticker = fundamentals.ticker

  if (!ohlcv || ohlcv.length < 20) {
    return { score: null, ema200: null, currentPrice: null, above: null }
  }

  const closes       = ohlcv.map(d => d.price)
  const period200    = Math.min(200, closes.length)
  const period50     = Math.min(50,  closes.length)
  const ema200       = calcEMA(closes, period200)
  const ema50        = calcEMA(closes, period50)
  const currentPrice = prices[ticker]?.price ?? closes[closes.length - 1]

  if (!ema200) return { score: null, ema200: null, currentPrice, above: null }

  const above = currentPrice > ema200
  let score   = above ? 5 : 0

  // Extension guard: penalize if price is parabolic above EMA50
  let extended = false
  if (above && ema50 && score > 0) {
    const atr = calcATR(ohlcv, 14)
    if (atr && atr > 0) {
      const extensionATR = (currentPrice - ema50) / atr
      if (extensionATR > 2.5) {
        score    = Math.max(0, score - 1)  // -1 pt for overextension
        extended = true
      }
    }
  }

  return {
    score,
    ema200,
    ema50,
    currentPrice,
    above,
    extended,
    periodUsed: period200,
  }
}
