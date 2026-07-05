/**
 * MODULE: UTILS / chartData.js
 * Generates synthetic price series for chart display.
 * Replace with a real API (Alpaca, Polygon, etc.) in production.
 */

/** Days to include per range selection */
export const RANGE_DAYS = {
  '1W':  7,
  '1M':  22,
  '3M':  63,
  '6M':  126,
  '1Y':  252,
}

/**
 * Generate a synthetic daily price series.
 * @param {number} targetPrice  - The current/end price anchor
 * @param {number} days         - Number of trading days to generate
 * @param {number} volatility   - Daily vol (default 0.022 ≈ 2.2%)
 * @returns {{ date: string, price: number }[]}
 */
export function genPriceData(targetPrice, days, volatility = 0.022) {
  // Start lower so we trend toward the current price
  let price = targetPrice * (0.74 + Math.random() * 0.12)
  const data = []

  for (let i = days; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue

    const drift  = 0.0004                             // slight upward bias
    const shock  = (Math.random() - 0.47) * volatility
    price = Math.max(price * (1 + shock + drift), price * 0.3)

    data.push({
      date:  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: parseFloat(price.toFixed(2)),
    })
  }

  // Thin to ~55 points max for chart performance
  const step = Math.max(1, Math.floor(data.length / 55))
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
}

/**
 * Pre-generate sparkline data for a list of tickers.
 * Returns a { [ticker]: dataArray } map.
 */
export function genSparklines(items, days = 21) {
  return Object.fromEntries(
    items.map(item => [item.ticker, genPriceData(item.currentPrice, days, 0.02)])
  )
}
