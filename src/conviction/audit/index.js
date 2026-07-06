/**
 * MODULE: conviction/audit/index.js
 * Builds the audit block attached to every conviction result.
 *
 * Not shown to the end user — used for:
 *   - Debugging score changes over time
 *   - Backtesting: "did the score change because of data or model?"
 *   - Identifying stale cache entries
 */

import { cache } from '../../utils/cache.js'

export function buildAudit(ctx) {
  const ticker   = ctx.fundamentals.ticker
  const fundInfo = cache.infoFund(ticker)

  return {
    provider: {
      fundamentals: 'Finnhub (metrics, consensus, earnings) + FMP (price target)',
      price:        'Finnhub /quote',
      ohlcv:        'Alpaca IEX',
      wallStreet:   'FMP /stable/price-target-consensus',
      ai:           'Groq Llama-3.3-70B',
    },
    cache: {
      fundamentalsAgeDays:  fundInfo?.daysSince    ?? null,
      fundamentalsDaysLeft: fundInfo?.daysLeft      ?? null,
      ohlcvPoints:          ctx.ohlcv?.length       ?? 0,
      spyOhlcvPoints:       ctx.spyOhlcv?.length    ?? 0,
    },
    sectorProfile: ctx.sectorProfile.name,
    ticker,
    computedAt:    Date.now(),
  }
}
