/**
 * MODULE: UTILS / indicators.js
 * Pure technical indicator calculations — no side effects.
 * All functions take an array of closes (numbers) and return an array of equal length.
 * Positions without enough data return null.
 */

/** Simple Moving Average */
export function calcSMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(4))
  })
}

/** Exponential Moving Average — seeded with first-period SMA */
export function calcEMA(closes, period) {
  const k = 2 / (period + 1)
  const result = new Array(closes.length).fill(null)
  if (closes.length < period) return result
  const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period
  result[period - 1] = parseFloat(seed.toFixed(4))
  for (let i = period; i < closes.length; i++) {
    result[i] = parseFloat((closes[i] * k + result[i - 1] * (1 - k)).toFixed(4))
  }
  return result
}

/** RSI (Wilder smoothing) */
export function calcRSI(closes, period = 14) {
  const result = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return result

  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) avgGain += d; else avgLoss += Math.abs(d)
  }
  avgGain /= period
  avgLoss /= period
  result[period] = avgLoss === 0 ? 100
    : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2))

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const g = d >= 0 ? d : 0, l = d < 0 ? Math.abs(d) : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    result[i] = avgLoss === 0 ? 100
      : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2))
  }
  return result
}

/** MACD (12/26/9) — returns { macdLine, signalLine, histogram } */
export function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMA(closes, fast)
  const emaSlow = calcEMA(closes, slow)

  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null
      ? parseFloat((emaFast[i] - emaSlow[i]).toFixed(4))
      : null
  )

  // Signal = EMA(9) of MACD line — only over valid MACD values
  const validIdxs = [], validMacd = []
  macdLine.forEach((v, i) => { if (v != null) { validIdxs.push(i); validMacd.push(v) } })
  const sigVals = calcEMA(validMacd, signal)

  const signalLine = new Array(closes.length).fill(null)
  validIdxs.forEach((origIdx, j) => {
    signalLine[origIdx] = sigVals[j] != null ? parseFloat(sigVals[j].toFixed(4)) : null
  })

  const histogram = macdLine.map((v, i) =>
    v != null && signalLine[i] != null
      ? parseFloat((v - signalLine[i]).toFixed(4))
      : null
  )

  return { macdLine, signalLine, histogram }
}

/** Bollinger Bands (20, 2σ) — returns array of { upper, middle, lower } */
export function calcBB(closes, period = 20, mult = 2) {
  const sma = calcSMA(closes, period)
  return closes.map((_, i) => {
    if (i < period - 1) return { upper: null, middle: null, lower: null }
    const slice = closes.slice(i - period + 1, i + 1)
    const mean = sma[i]
    const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period)
    return {
      upper:  parseFloat((mean + mult * std).toFixed(2)),
      middle: parseFloat(mean.toFixed(2)),
      lower:  parseFloat((mean - mult * std).toFixed(2)),
    }
  })
}

/**
 * Linear-regression forecast — projects `bars` candles forward.
 * Uses the last min(closes.length, 30) bars as the regression window.
 * Returns array of { forecast, fUpper, fLower } for each projected bar.
 */
export function calcForecast(closes, bars = 12) {
  const n = Math.min(closes.length, 30)
  if (n < 5) return []

  const slice = closes.slice(closes.length - n)
  const mx = (n - 1) / 2
  const my = slice.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (slice[i] - my)
    den += Math.pow(i - mx, 2)
  }
  const slope = den ? num / den : 0
  const intercept = my - slope * mx
  const rmse = Math.sqrt(
    slice.reduce((s, v, i) => s + Math.pow(v - (intercept + slope * i), 2), 0) / n
  )

  return Array.from({ length: bars }, (_, i) => {
    const x = n + i
    const proj = intercept + slope * x
    return {
      forecast: parseFloat(proj.toFixed(2)),
      fUpper:   parseFloat((proj + 1.5 * rmse).toFixed(2)),
      fLower:   parseFloat((proj - 1.5 * rmse).toFixed(2)),
    }
  })
}

/** Thin a data array to at most maxPoints — keeps first, last, and evenly spaced points */
export function thinData(data, maxPoints = 300) {
  if (data.length <= maxPoints) return data
  const step = Math.floor(data.length / maxPoints)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}
