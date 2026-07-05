/**
 * MODULE: API / config.js
 * API key management.
 *
 * Priority order (highest → lowest):
 *  1. User-saved key in localStorage  (set via Settings panel)
 *  2. Vite environment variable       (set in .env.local or Cloudflare Pages)
 *  3. null                            (not configured — graceful fallback)
 *
 * Keys are read at CALL TIME (not module load time) so they update
 * immediately after saving in the Settings panel without a page reload.
 */

/* ── localStorage key names ──────────────────────────────── */
export const LS_KEYS = {
  finnhub:      'tp_key_finnhub',
  alpacaKey:    'tp_key_alpaca_key',
  alpacaSecret: 'tp_key_alpaca_secret',
  fmp:          'tp_key_fmp',
  groq:         'tp_key_groq',
}

/* ── Runtime key resolver ────────────────────────────────── */
export function getApiKeys() {
  return {
    finnhub:      localStorage.getItem(LS_KEYS.finnhub)      || import.meta.env.VITE_FINNHUB_KEY     || null,
    alpacaKey:    localStorage.getItem(LS_KEYS.alpacaKey)    || import.meta.env.VITE_ALPACA_KEY      || null,
    alpacaSecret: localStorage.getItem(LS_KEYS.alpacaSecret) || import.meta.env.VITE_ALPACA_SECRET   || null,
    fmp:          localStorage.getItem(LS_KEYS.fmp)          || import.meta.env.VITE_FMP_KEY         || null,
    groq:         localStorage.getItem(LS_KEYS.groq)         || import.meta.env.VITE_GROQ_KEY        || null,
  }
}

/* ── Status helper ───────────────────────────────────────── */
export function getApiStatus() {
  const k = getApiKeys()
  return {
    finnhub: !!k.finnhub,
    alpaca:  !!(k.alpacaKey && k.alpacaSecret),
    fmp:     !!k.fmp,
    groq:    !!k.groq,
  }
}

export const ENDPOINTS = {
  finnhub: 'https://finnhub.io/api/v1',
  alpaca:  'https://data.alpaca.markets/v2',
  fmp:     'https://financialmodelingprep.com/api/v3',
  groq:    'https://api.groq.com/openai/v1',
}
