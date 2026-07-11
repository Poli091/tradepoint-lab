/**
 * UTIL: autoAddEarnings.js
 * When a ticker is added to portfolio or watchlist, fetch its next earnings date
 * from Finnhub via the Worker and add it to the earnings calendar automatically.
 */
import { workerAPI } from '../utils/api/worker.js'
import { loadEarnings, saveEarnings } from '../utils/earningsStorage.js'

export async function autoAddEarnings(ticker) {
  try {
    // Fetch earnings calendar from Worker (Finnhub)
    const res = await workerAPI.earnings()
    if (!res?.data) return

    // Find this ticker's next earnings
    const entry = res.data
      .filter(e => e.ticker === ticker || e.symbol === ticker)
      .filter(e => e.date && new Date(e.date) >= new Date())
      .sort((a,b) => new Date(a.date) - new Date(b.date))[0]

    if (!entry) return  // no upcoming earnings found

    // Add to calendar if not already there
    const current = loadEarnings() ?? []
    const alreadyExists = current.some(e => e.ticker === ticker && e.date === entry.date)
    if (alreadyExists) return

    const newEvent = {
      ticker,
      date:  entry.date,
      type:  'monitor',     // default — user can change it
      note:  `Auto-added from Finnhub`,
    }

    saveEarnings([...current, newEvent])
    console.warn(`[autoAddEarnings] Added ${ticker} earnings on ${entry.date}`)
  } catch (e) {
    // Silent — never block the main save operation
    console.warn('[autoAddEarnings]', ticker, e.message)
  }
}
