/**
 * MODULE: UTILS / chartData.js
 * Generates synthetic price series used as fallback before live data loads.
 */

/** Calendar-day lookback per range (for mock data generation & worker requests) */
export const RANGE_DAYS = {
  '1D':  1,
  '1W':  7,
  '1M':  35,
  '6M':  185,
  'YTD': null,   // computed dynamically (Jan 1 → today)
  '1Y':  365,
  '2Y':  730,
  '5Y':  1825,
  'ALL': 3650,
}

/** Generate synthetic daily price series (fallback when Worker is offline) */
export function genPriceData(targetPrice, days, volatility = 0.022) {
  let price = targetPrice * (0.74 + Math.random() * 0.12)
  const data = []

  for (let i = days; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const shock = (Math.random() - 0.47) * volatility
    price = Math.max(price * (1 + shock + 0.0004), price * 0.3)
    data.push({
      date:  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: parseFloat(price.toFixed(2)),
      open: parseFloat((price * (1 - Math.random() * 0.01)).toFixed(2)),
      high: parseFloat((price * (1 + Math.random() * 0.015)).toFixed(2)),
      low:  parseFloat((price * (1 - Math.random() * 0.015)).toFixed(2)),
      volume: Math.round(1e7 + Math.random() * 5e7),
    })
  }

  const step = Math.max(1, Math.floor(data.length / 55))
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

/** Pre-generate sparklines for a watchlist */
export function genSparklines(items, days = 21) {
  return Object.fromEntries(
    items.map(item => [item.ticker, genPriceData(item.currentPrice, days, 0.02)])
  )
}
