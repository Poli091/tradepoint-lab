/**
 * MODULE: conviction/confidence/index.js
 * Confidence = % of data completeness (20–100).
 *
 * Starts at 100, decreases for:
 *   - Each null field across scoring dimensions (-5% each)
 *   - Banks profile: strength skipped (-10%)
 *   - Insufficient OHLCV for technicals (-15%)
 *   - No SPY data for RS calculation (-5%)
 *   - EMA period < 200 (insufficient history) (-5%)
 *
 * Minimum confidence: 20% (always shows some signal even with sparse data)
 */

export function calcConfidence(scores, ctx) {
  let deductions = 0

  // Null fields in each dimension
  const nullFields = [
    scores.growth?.nullFields    ?? 0,
    scores.quality?.nullFields   ?? 0,
    scores.valuation?.nullFields ?? 0,
    scores.technical?.nullFields ?? 0,
    // Strength nulls: if skipped (banks), counted separately below
    scores.strength?.skipped ? 0 : (scores.strength?.nullFields ?? 0),
  ].reduce((a, b) => a + b, 0)

  deductions += nullFields * 5

  // Banks: strength entirely skipped
  if (scores.strength?.skipped) deductions += 10

  // OHLCV data quality
  const ohlcvLen    = ctx.ohlcv?.length    ?? 0
  const spyOhlcvLen = ctx.spyOhlcv?.length ?? 0

  if (ohlcvLen < 20)  deductions += 15   // no technical indicators possible
  else if (ohlcvLen < 100) deductions += 8  // EMA200 uses shorter period

  if (spyOhlcvLen < 20) deductions += 5  // RS vs SPY unavailable

  // EMA period used < 200 (insufficient history for full EMA200)
  const emaPeriod = scores.technical?.components?.ema200?.periodUsed
  if (emaPeriod != null && emaPeriod < 200) deductions += 5

  return Math.max(Math.round(100 - deductions), 20)
}
