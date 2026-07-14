/**
 * MODULE: API / index.js
 * Single entry point for all data fetching.
 * Falls back to mock data if an API key is not configured.
 * Import everything from here — don't import individual API files in components.
 */

export { getQuote, getAnalystTarget, calcUpside, getEarningsCalendar, getNews } from './finnhub.js'
export { getOHLCV } from './alpaca.js'
export { analyzeTickerAI } from './groq.js'
export { getApiStatus } from './config.js'
