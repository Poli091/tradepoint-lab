/**
 * MODULE: DATA / positions.js
 * Raw position data for both accounts.
 * Edit prices/qty here to reflect your real portfolio.
 */

export const POSITIONS = [
  { ticker: 'NVDA', name: 'NVIDIA',           qty: 12, avgPrice: 98.40,   currentPrice: 141.80, upside: 44.57, conviction: 84 },
  { ticker: 'AVGO', name: 'Broadcom',          qty: 5,  avgPrice: 142.20,  currentPrice: 198.50, upside: 37.65, conviction: 78 },
  { ticker: 'VST',  name: 'Vistra Energy',     qty: 8,  avgPrice: 88.10,   currentPrice: 179.30, upside: 52.44, conviction: 82 },
  { ticker: 'META', name: 'Meta Platforms',    qty: 4,  avgPrice: 312.50,  currentPrice: 712.40, upside: 45.08, conviction: 88 },
  { ticker: 'PODD', name: 'Insulet Corp',      qty: 10, avgPrice: 122.00,  currentPrice: 198.60, upside: 64.15, conviction: 76 },
  { ticker: 'MELI', name: 'MercadoLibre',      qty: 2,  avgPrice: 1420.00, currentPrice: 2280.10, upside: 39.47, conviction: 74 },
  { ticker: 'AXON', name: 'Axon Enterprise',   qty: 6,  avgPrice: 198.00,  currentPrice: 568.20, upside: 50.29, conviction: 86 },
  { ticker: 'PLTR', name: 'Palantir',          qty: 20, avgPrice: 22.40,   currentPrice: 142.30, upside: 41.96, conviction: 65 },
  { ticker: 'APP',  name: 'AppLovin',          qty: 8,  avgPrice: 112.00,  currentPrice: 468.90, upside: 37.98, conviction: 72 },
  { ticker: 'FICO', name: 'FICO',              qty: 1,  avgPrice: 1680.00, currentPrice: 2410.00, upside: 39.95, conviction: 70 },
  { ticker: 'CEG',  name: 'Constellation',     qty: 4,  avgPrice: 142.00,  currentPrice: 298.40, upside: 48.32, conviction: 80 },
  { ticker: 'TEAM', name: 'Atlassian',         qty: 6,  avgPrice: 198.00,  currentPrice: 292.50, upside: 63.94, conviction: 79 },
]

/** Tickers held in the Roth IRA */
export const ROTH_TICKERS = ['NVDA', 'AVGO', 'VST', 'META', 'PODD', 'MELI', 'AXON', 'PLTR']

/** Tickers held in the Taxable Brokerage */
export const BROKERAGE_TICKERS = ['VST', 'NVDA', 'PODD', 'TEAM', 'MELI', 'AXON', 'AVGO', 'CEG', 'APP', 'PLTR', 'FICO']
