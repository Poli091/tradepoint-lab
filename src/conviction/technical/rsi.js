/**
 * RSI calculation and scoring (3 pts).
 *
 * RSI Range  Score  Rationale
 * 40–60      3      Healthy momentum range
 * 30–40      2      Oversold — potential entry
 * 60–70      2      Overbought but may continue
 * <30 or >70 1      Extreme — penalize slightly but not kill
 *             (strong trends can stay overbought for months)
 *
 * Uses Wilder's Smoothed Moving Average (standard RSI formula).
 */

/**
 * Calculate RSI-14 from an array of close prices (oldest → newest).
 * @param {number[]} closes
 * @param {number} period - default 14
 * @returns {number|null} RSI value 0–100
 */
export function calcRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null

  // Seed: simple average of first `period` gains/losses
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff > 0) gains  += diff
    else          losses -= diff
  }

  let avgGain = gains  / period
  let avgLoss = losses / period

  // Wilder's smoothing for remaining periods
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff :  0)) / period
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100
}

export function scoreRSI(ctx) {
  const { ohlcv } = ctx
  if (!ohlcv || ohlcv.length < 16) return { score: null, rsi: null }

  const closes = ohlcv.map(d => d.price)
  const rsi    = calcRSI(closes)
  if (rsi == null) return { score: null, rsi: null }

  let score = 0
  if      (rsi >= 40 && rsi <= 60) score = 3   // healthy range
  else if (rsi >= 30 && rsi <= 70) score = 2   // normal range
  else                              score = 1   // extreme (<30 or >70)

  return { score, rsi }
}
