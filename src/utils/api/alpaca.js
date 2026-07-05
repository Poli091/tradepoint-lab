/**
 * MODULE: API / alpaca.js
 * Alpaca Markets — free tier, unlimited paper trading data.
 *
 * Provides:
 *  · Historical OHLCV bars (1D timeframe) for the price chart
 *
 * Cache: 24h per ticker+range combo.
 * A closed trading day never changes, so 24h is safe and efficient.
 */

import { getApiKeys, ENDPOINTS } from './config.js'
import { cache } from '../cache.js'

const BASE = ENDPOINTS.alpaca

const RANGE_PARAMS = {
  '1W': { days: 7,   timeframe: '1D' },
  '1M': { days: 30,  timeframe: '1D' },
  '3M': { days: 90,  timeframe: '1D' },
  '6M': { days: 180, timeframe: '1D' },
  '1Y': { days: 365, timeframe: '1D' },
}

function dateStr(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split('T')[0]
}

/**
 * Fetch OHLCV bars for a ticker and time range.
 * Returns { date: string, price: number (close) }[] for recharts.
 */
export async function getOHLCV(ticker, range = '3M') {
  const cached = cache.getOHLCV(ticker, range)
  if (cached) return { data: cached, fromCache: true }

  const { days, timeframe } = RANGE_PARAMS[range] ?? RANGE_PARAMS['3M']
  const start = dateStr(days)
  const end   = dateStr(0)

  if (!getApiKeys().alpacaKey || !getApiKeys().alpacaSecret) {
    throw new Error('Alpaca keys not configured')
  }

  const url = `${BASE}/stocks/${ticker}/bars?timeframe=${timeframe}&start=${start}&end=${end}&limit=1000&feed=iex`
  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID':     getApiKeys().alpacaKey,
      'APCA-API-SECRET-KEY': getApiKeys().alpacaSecret,
    },
  })
  if (!res.ok) throw new Error(`Alpaca ${res.status}: ${ticker} ${range}`)
  const raw = await res.json()

  const data = (raw.bars ?? []).map(bar => ({
    date:  new Date(bar.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: parseFloat(bar.c.toFixed(2)),  // close price
    open:  bar.o,
    high:  bar.h,
    low:   bar.l,
    volume: bar.v,
  }))

  cache.setOHLCV(ticker, range, data)
  return { data, fromCache: false }
}
