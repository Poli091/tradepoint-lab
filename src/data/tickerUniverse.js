/**
 * MODULE: DATA / tickerUniverse.js
 * Static ticker database — no API calls needed.
 * Used for sector comparisons, screener, and adding tickers to the watchlist.
 *
 * To add a ticker: find its sector array and append the object.
 */

export const BENCHMARKS = [
  { ticker: 'SPY',  name: 'S&P 500 ETF',      type: 'etf' },
  { ticker: 'QQQ',  name: 'Nasdaq 100 ETF',    type: 'etf' },
  { ticker: 'DIA',  name: 'Dow Jones ETF',     type: 'etf' },
  { ticker: 'IWM',  name: 'Russell 2000 ETF',  type: 'etf' },
  { ticker: 'XLK',  name: 'Tech Sector ETF',   type: 'etf' },
  { ticker: 'XLF',  name: 'Financial ETF',     type: 'etf' },
  { ticker: 'XLV',  name: 'Healthcare ETF',    type: 'etf' },
  { ticker: 'XLE',  name: 'Energy ETF',        type: 'etf' },
  { ticker: 'ARKK', name: 'ARK Innovation ETF',type: 'etf' },
]

export const SECTORS = {
  'Semiconductors': [
    { ticker: 'NVDA', name: 'NVIDIA' },
    { ticker: 'AVGO', name: 'Broadcom' },
    { ticker: 'AMD',  name: 'Advanced Micro Devices' },
    { ticker: 'TSM',  name: 'Taiwan Semiconductor' },
    { ticker: 'QCOM', name: 'Qualcomm' },
    { ticker: 'MU',   name: 'Micron Technology' },
    { ticker: 'INTC', name: 'Intel' },
    { ticker: 'MRVL', name: 'Marvell Technology' },
    { ticker: 'ARM',  name: 'Arm Holdings' },
    { ticker: 'ASML', name: 'ASML Holding' },
    { ticker: 'AMAT', name: 'Applied Materials' },
    { ticker: 'LRCX', name: 'Lam Research' },
    { ticker: 'KLAC', name: 'KLA Corporation' },
    { ticker: 'TXN',  name: 'Texas Instruments' },
  ],

  'Software / SaaS': [
    { ticker: 'MSFT', name: 'Microsoft' },
    { ticker: 'NOW',  name: 'ServiceNow' },
    { ticker: 'TEAM', name: 'Atlassian' },
    { ticker: 'VEEV', name: 'Veeva Systems' },
    { ticker: 'CRM',  name: 'Salesforce' },
    { ticker: 'SNOW', name: 'Snowflake' },
    { ticker: 'ADBE', name: 'Adobe' },
    { ticker: 'WDAY', name: 'Workday' },
    { ticker: 'ORCL', name: 'Oracle' },
    { ticker: 'INTU', name: 'Intuit' },
    { ticker: 'DDOG', name: 'Datadog' },
    { ticker: 'NET',  name: 'Cloudflare' },
    { ticker: 'ZS',   name: 'Zscaler' },
    { ticker: 'PANW', name: 'Palo Alto Networks' },
    { ticker: 'CRWD', name: 'CrowdStrike' },
    { ticker: 'GTLB', name: 'GitLab' },
  ],

  'AI / Data': [
    { ticker: 'PLTR', name: 'Palantir' },
    { ticker: 'AI',   name: 'C3.ai' },
    { ticker: 'PATH', name: 'UiPath' },
    { ticker: 'SOUN', name: 'SoundHound AI' },
    { ticker: 'BBAI', name: 'BigBear.ai' },
    { ticker: 'APLD', name: 'Applied Digital' },
  ],

  'Ad-Tech / Consumer Internet': [
    { ticker: 'APP',   name: 'AppLovin' },
    { ticker: 'TTD',   name: 'The Trade Desk' },
    { ticker: 'META',  name: 'Meta Platforms' },
    { ticker: 'GOOGL', name: 'Alphabet' },
    { ticker: 'MGNI',  name: 'Magnite' },
    { ticker: 'UBER',  name: 'Uber' },
    { ticker: 'LYFT',  name: 'Lyft' },
  ],

  'E-Commerce / LatAm': [
    { ticker: 'MELI', name: 'MercadoLibre' },
    { ticker: 'SE',   name: 'Sea Limited' },
    { ticker: 'BABA', name: 'Alibaba' },
    { ticker: 'SHOP', name: 'Shopify' },
    { ticker: 'AMZN', name: 'Amazon' },
    { ticker: 'JD',   name: 'JD.com' },
    { ticker: 'PDD',  name: 'PDD Holdings' },
    { ticker: 'TEMU', name: 'Temu (PDD)' },
  ],

  'MedTech / Healthcare': [
    { ticker: 'PODD', name: 'Insulet Corp' },
    { ticker: 'ISRG', name: 'Intuitive Surgical' },
    { ticker: 'BSX',  name: 'Boston Scientific' },
    { ticker: 'MDT',  name: 'Medtronic' },
    { ticker: 'ABT',  name: 'Abbott Laboratories' },
    { ticker: 'SYK',  name: 'Stryker' },
    { ticker: 'EW',   name: 'Edwards Lifesciences' },
    { ticker: 'DXCM', name: 'DexCom' },
    { ticker: 'VRTX', name: 'Vertex Pharmaceuticals' },
    { ticker: 'LLY',  name: 'Eli Lilly' },
    { ticker: 'REGN', name: 'Regeneron' },
    { ticker: 'AMGN', name: 'Amgen' },
  ],

  'Energy / Nuclear': [
    { ticker: 'VST',  name: 'Vistra Energy' },
    { ticker: 'CEG',  name: 'Constellation Energy' },
    { ticker: 'NEE',  name: 'NextEra Energy' },
    { ticker: 'NRG',  name: 'NRG Energy' },
    { ticker: 'ETR',  name: 'Entergy' },
    { ticker: 'PCG',  name: 'PG&E' },
    { ticker: 'OKLO', name: 'Oklo' },
    { ticker: 'SMR',  name: 'NuScale Power' },
    { ticker: 'VRT',  name: 'Vertiv Holdings' },
  ],

  'Fintech / Credit Scores': [
    { ticker: 'FICO', name: 'FICO' },
    { ticker: 'V',    name: 'Visa' },
    { ticker: 'MA',   name: 'Mastercard' },
    { ticker: 'PYPL', name: 'PayPal' },
    { ticker: 'SQ',   name: 'Block' },
    { ticker: 'SOFI', name: 'SoFi Technologies' },
    { ticker: 'NU',   name: 'Nu Holdings' },
    { ticker: 'AFRM', name: 'Affirm' },
    { ticker: 'SPGI', name: 'S&P Global' },
    { ticker: 'MCO',  name: "Moody's" },
  ],

  'Defense / Safety': [
    { ticker: 'AXON', name: 'Axon Enterprise' },
    { ticker: 'LMT',  name: 'Lockheed Martin' },
    { ticker: 'NOC',  name: 'Northrop Grumman' },
    { ticker: 'RTX',  name: 'RTX Corporation' },
    { ticker: 'GD',   name: 'General Dynamics' },
    { ticker: 'LDOS', name: 'Leidos' },
    { ticker: 'CACI', name: 'CACI International' },
  ],

  'Financial': [
    { ticker: 'JPM',  name: 'JPMorgan Chase' },
    { ticker: 'GS',   name: 'Goldman Sachs' },
    { ticker: 'MS',   name: 'Morgan Stanley' },
    { ticker: 'BAC',  name: 'Bank of America' },
    { ticker: 'BLK',  name: 'BlackRock' },
    { ticker: 'SCHW', name: 'Charles Schwab' },
  ],
}

/** Flat list of all tickers in the universe */
export const ALL_TICKERS = [
  ...BENCHMARKS,
  ...Object.values(SECTORS).flat(),
]

/** Find which sector a ticker belongs to */
export function getSectorOf(ticker) {
  for (const [sector, tickers] of Object.entries(SECTORS)) {
    if (tickers.some(t => t.ticker === ticker)) return sector
  }
  return null
}

/** Get all tickers in the same sector as the given ticker */
export function getSectorPeers(ticker) {
  const sector = getSectorOf(ticker)
  if (!sector) return []
  return SECTORS[sector].filter(t => t.ticker !== ticker)
}
