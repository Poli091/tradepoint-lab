/**
 * MODULE: API / config.js
 * Reads API keys from Vite environment variables.
 *
 * HOW TO CONFIGURE (two options):
 *
 * A) Local development — create a .env.local file in the project root:
 *    VITE_FINNHUB_KEY=your_key_here
 *    VITE_ALPACA_KEY=your_key_here
 *    VITE_ALPACA_SECRET=your_secret_here
 *    VITE_FMP_KEY=your_key_here
 *    VITE_GROQ_KEY=your_key_here
 *
 * B) Cloudflare Pages — in the dashboard:
 *    Settings → Environment variables → Add the same variable names above.
 *    They'll be injected at build time automatically.
 *
 * The app works WITHOUT keys — it uses mock/cached data.
 * As soon as a key is set, that API activates automatically.
 */

export const API_KEYS = {
  finnhub:      import.meta.env.VITE_FINNHUB_KEY     || null,
  alpacaKey:    import.meta.env.VITE_ALPACA_KEY      || null,
  alpacaSecret: import.meta.env.VITE_ALPACA_SECRET   || null,
  fmp:          import.meta.env.VITE_FMP_KEY         || null,
  groq:         import.meta.env.VITE_GROQ_KEY        || null,
}

export const ENDPOINTS = {
  finnhub: 'https://finnhub.io/api/v1',
  alpaca:  'https://data.alpaca.markets/v2',
  fmp:     'https://financialmodelingprep.com/api/v3',
  groq:    'https://api.groq.com/openai/v1',
}

/** Returns which APIs are currently configured */
export function getApiStatus() {
  return {
    finnhub: !!API_KEYS.finnhub,
    alpaca:  !!(API_KEYS.alpacaKey && API_KEYS.alpacaSecret),
    fmp:     !!API_KEYS.fmp,
    groq:    !!API_KEYS.groq,
  }
}
