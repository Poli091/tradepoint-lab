/**
 * TradePoint Lab — Cloudflare Worker v1.0
 *
 * Sits between the browser and the 4 external APIs.
 * Every response is cached in KV with TTL and Data Freshness metadata.
 * All devices share the same KV — scan once, read everywhere.
 *
 * API keys: accepted as request headers (from browser localStorage)
 * OR as Cloudflare secrets (set once via wrangler CLI or dashboard).
 * Secrets take precedence if both are present.
 *
 * Endpoints:
 *   GET /api/status
 *   GET /api/fundamentals/:ticker          → Finnhub (2 calls) + FMP (2 calls)
 *   GET /api/price/:ticker                 → Finnhub quote
 *   GET /api/ohlcv/:ticker/:range          → Alpaca bars (range: 1W 1M 3M 6M 1Y)
 *   GET /api/news/:ticker                  → Finnhub company news
 *   GET /api/moat/:ticker                  → Groq AI (30d cache)
 *   GET /api/bear/:ticker                  → Groq AI (7d cache)
 *   GET /api/catalysts/:ticker             → Groq AI (7d cache)
 *   GET /api/earnings                      → Finnhub earnings calendar
 *   GET /api/cache/info/:ticker            → Data Freshness per data type
 *   GET /api/cache/clear/:ticker           → Manual refresh (clears KV for ticker)
 *
 * Add ?refresh=1 to fundamentals to force re-fetch bypassing KV.
 */

/* ════════════════════════════════════════════════════════════
   MODULE 1 — CONFIG & CONSTANTS
════════════════════════════════════════════════════════════ */

/** TTL in seconds — matches the user's recommended cache strategy */
const TTL = {
  PRICE:        5  * 60,              // 5 min
  OHLCV:        24 * 60 * 60,         // 1 day
  ANALYST:      24 * 60 * 60,         // 1 day (upgrades/downgrades post-earnings)
  NEWS:         8  * 60 * 60,         // 8 h
  EARNINGS:     7  * 24 * 60 * 60,    // 7 days
  FUNDAMENTALS: 90 * 24 * 60 * 60,    // 90 days (only change at quarterly earnings)
  MOAT:         30 * 24 * 60 * 60,    // 30 days
  BEAR:         7  * 24 * 60 * 60,    // 7 days
  CATALYSTS:    7  * 24 * 60 * 60,    // 7 days
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': [
    'Content-Type',
    'X-Finnhub-Key', 'X-FMP-Key',
    'X-Alpaca-Key',  'X-Alpaca-Secret', 'X-Groq-Key',
  ].join(', '),
}

const RANGE_DAYS = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }

/* ════════════════════════════════════════════════════════════
   MODULE 2 — UTILITIES
════════════════════════════════════════════════════════════ */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status} → ${url.split('?')[0]}`)
  return res.json()
}

/** Extract API keys — Cloudflare secrets take priority over browser headers */
function getKeys(request, env) {
  const h = k => request.headers.get(k) || ''
  return {
    finnhub:      env.FINNHUB_KEY     || h('X-Finnhub-Key'),
    fmp:          env.FMP_KEY         || h('X-FMP-Key'),
    alpacaKey:    env.ALPACA_KEY      || h('X-Alpaca-Key'),
    alpacaSecret: env.ALPACA_SECRET   || h('X-Alpaca-Secret'),
    groq:         env.GROQ_KEY        || h('X-Groq-Key'),
  }
}

/** Build Data Freshness metadata attached to every response */
function buildMeta(ticker, type, ttlSec, fromCache) {
  const now = Date.now()
  return {
    ticker,
    type,
    fetchedAt:  now,
    expiresAt:  now + ttlSec * 1000,
    ttlSec,
    fromCache,
    source: fromCache ? 'kv' : 'api',
  }
}

/* ════════════════════════════════════════════════════════════
   MODULE 3 — KV HELPERS
════════════════════════════════════════════════════════════ */

async function kvGet(kv, key) {
  const { value, metadata } = await kv.getWithMetadata(key, 'json')
  return { value, metadata }
}

async function kvSet(kv, key, data, ttlSec, metadata) {
  await kv.put(key, JSON.stringify(data), {
    expirationTtl: ttlSec,
    metadata,
  })
}

/* ════════════════════════════════════════════════════════════
   MODULE 4 — API FETCH HELPERS
════════════════════════════════════════════════════════════ */

async function finnhubGet(path, key) {
  if (!key) throw new Error('Finnhub key not configured')
  return fetchJSON(`https://finnhub.io/api/v1${path}&token=${key}`)
}

async function fmpGet(path, key) {
  if (!key) throw new Error('FMP key not configured')
  return fetchJSON(`https://financialmodelingprep.com/api/v3${path}&apikey=${key}`)
    .catch(() => null)
}

async function alpacaGet(path, keys) {
  if (!keys.alpacaKey || !keys.alpacaSecret) {
    throw new Error('Alpaca keys not configured')
  }
  return fetchJSON(`https://data.alpaca.markets${path}`, {
    headers: {
      'APCA-API-KEY-ID':     keys.alpacaKey,
      'APCA-API-SECRET-KEY': keys.alpacaSecret,
    },
  })
}

/* ════════════════════════════════════════════════════════════
   MODULE 5 — ROUTE HANDLERS
════════════════════════════════════════════════════════════ */

/* ── /api/fundamentals/:ticker ───────────────────────────── */
async function handleFundamentals(ticker, keys, kv, forceRefresh) {
  const t     = ticker.toUpperCase()
  const kvKey = `fund:${t}`

  if (!forceRefresh) {
    const { value, metadata } = await kvGet(kv, kvKey)
    if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  }

  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)
  if (!keys.fmp)     return json({ error: 'FMP key not configured' }, 401)

  // 5 parallel calls (2 Finnhub + 2 FMP + 1 Finnhub recommendations)
  const [fhMetrics, fhTarget, fhRecs, fmpMetrics, fmpEarnings] = await Promise.all([
    finnhubGet(`/stock/metric?symbol=${t}&metric=all`, keys.finnhub),
    finnhubGet(`/stock/price-target?symbol=${t}`, keys.finnhub),
    finnhubGet(`/stock/recommendation?symbol=${t}`, keys.finnhub),
    fmpGet(`/key-metrics/${t}?limit=1`, keys.fmp),
    fmpGet(`/earnings-surprises/${t}`, keys.fmp),
  ])

  const m    = fhMetrics?.metric  || {}
  const rec  = Array.isArray(fhRecs) ? (fhRecs[0] || {}) : {}
  const fm   = Array.isArray(fmpMetrics)  ? (fmpMetrics[0]  || {}) : {}
  const earns = Array.isArray(fmpEarnings) ? fmpEarnings : []

  // Consecutive earnings beats
  let consecutiveBeats = 0
  for (const e of earns) {
    if ((e.actualEarningResult ?? 0) > (e.estimatedEarning ?? 0)) consecutiveBeats++
    else break
  }
  const lastEarning = earns[0] || {}
  const epsSurprisePct = lastEarning.estimatedEarning
    ? ((lastEarning.actualEarningResult - lastEarning.estimatedEarning)
       / Math.abs(lastEarning.estimatedEarning)) * 100
    : null

  const data = {
    ticker: t,
    // ── Growth (Finnhub) — values are decimals: 0.20 = 20%
    revenueGrowthYoY: m.revenueGrowthTTMYoy          ?? null,
    revenueGrowth3Y:  m.revenueGrowth3Y               ?? null,
    revenueGrowth5Y:  m.revenueGrowth5Y               ?? null,
    epsGrowthYoY:     m.epsGrowthTTMYoy               ?? null,
    epsGrowth3Y:      m.epsGrowth3Y                   ?? null,
    epsGrowth5Y:      m.epsGrowth5Y                   ?? null,
    fcfTTM:           m.freeCashFlowTTM               ?? null,
    fcfGrowth5Y:      m.freeCashFlowGrowth5Y          ?? null,
    // ── Quality (Finnhub)
    roe:              m.roeTTM                         ?? null,
    grossMargin:      m.grossMarginTTM                 ?? null,
    operatingMargin:  m.operatingMarginTTM             ?? null,
    netMargin:        m.netMarginTTM                   ?? null,
    // ── Strength (Finnhub)
    debtToEquity:     m['totalDebt/totalEquityAnnual'] ?? null,
    currentRatio:     m.currentRatioAnnual             ?? null,
    interestCoverage: m.interestCoverageAnnual         ?? null,
    // ── Valuation (Finnhub)
    pe:               m.peBasicExclExtraTTM ?? m.peTTM ?? null,
    evEbitda:         m['ev/ebitdaTTM']                ?? null,
    pFcf:             m.pfcfShareTTM                   ?? null,
    beta:             m.beta                           ?? null,
    // ── ROIC + PEG + beat history (FMP — the 3 things FMP does better)
    roic:             fm.returnOnInvestedCapital        ?? null,
    peg:              fm.priceEarningsToGrowthRatio     ?? null,
    consecutiveBeats,
    epsSurprisePct,
    // ── Analyst consensus (Finnhub)
    targetMean:       fhTarget.targetMean              ?? null,
    targetHigh:       fhTarget.targetHigh              ?? null,
    targetLow:        fhTarget.targetLow               ?? null,
    targetMedian:     fhTarget.targetMedian            ?? null,
    strongBuy:        rec.strongBuy                    ?? 0,
    buy:              rec.buy                          ?? 0,
    hold:             rec.hold                         ?? 0,
    sell:             rec.sell                         ?? 0,
    strongSell:       rec.strongSell                   ?? 0,
  }

  const meta2 = buildMeta(t, 'fundamentals', TTL.FUNDAMENTALS, false)
  await kvSet(kv, kvKey, data, TTL.FUNDAMENTALS, meta2)
  return json({ data, meta: meta2 })
}

/* ── /api/price/:ticker ──────────────────────────────────── */
async function handlePrice(ticker, keys, kv) {
  const t     = ticker.toUpperCase()
  const kvKey = `price:${t}`

  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)

  const raw = await finnhubGet(`/quote?symbol=${t}`, keys.finnhub)
  const data = {
    ticker: t, price: raw.c, change: raw.d, changePct: raw.dp,
    high: raw.h, low: raw.l, open: raw.o, prevClose: raw.pc,
  }

  const meta2 = buildMeta(t, 'price', TTL.PRICE, false)
  await kvSet(kv, kvKey, data, TTL.PRICE, meta2)
  return json({ data, meta: meta2 })
}

/* ── /api/ohlcv/:ticker/:range ───────────────────────────── */
async function handleOHLCV(ticker, range, keys, kv) {
  const t     = ticker.toUpperCase()
  const r     = (range || '3M').toUpperCase()
  const kvKey = `ohlcv:${t}:${r}`

  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  const days  = RANGE_DAYS[r] || 90
  const end   = new Date().toISOString().split('T')[0]
  const start = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]

  const raw = await alpacaGet(
    `/v2/stocks/${t}/bars?timeframe=1Day&start=${start}&end=${end}&limit=500&feed=iex`,
    keys
  )

  const data = (raw.bars || []).map(bar => ({
    date:   new Date(bar.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price:  parseFloat(bar.c.toFixed(2)),
    open:   bar.o, high: bar.h, low: bar.l, volume: bar.v,
  }))

  const meta2 = buildMeta(t, 'ohlcv', TTL.OHLCV, false)
  await kvSet(kv, kvKey, data, TTL.OHLCV, meta2)
  return json({ data, meta: meta2 })
}

/* ── /api/news/:ticker ───────────────────────────────────── */
async function handleNews(ticker, keys, kv) {
  const t     = ticker.toUpperCase()
  const kvKey = `news:${t}`

  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)

  const to   = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]
  const raw  = await finnhubGet(`/company-news?symbol=${t}&from=${from}&to=${to}`, keys.finnhub)

  const data = (raw || []).slice(0, 15).map(n => ({
    id: n.id, headline: n.headline, summary: n.summary,
    url: n.url, source: n.source, datetime: n.datetime,
    image: n.image, sentiment: n.sentiment,
  }))

  const meta2 = buildMeta(t, 'news', TTL.NEWS, false)
  await kvSet(kv, kvKey, data, TTL.NEWS, meta2)
  return json({ data, meta: meta2 })
}

/* ── /api/moat|bear|catalysts/:ticker ───────────────────── */
const GROQ_PROMPTS = {
  moat: t =>
    `Analyze the economic moat of ${t} in exactly 3 bullet points. Each bullet: one sentence, specific.
Format: "• [Moat type]: [explanation]"
Focus on: switching costs, network effects, cost advantages, intangible assets, efficient scale. Max 150 words.`,

  bear: t =>
    `List the 3 biggest risks for ${t} in exactly 3 bullet points. Each bullet: one sentence.
Format: "• [Risk]: [explanation]"
Include: competitive threats, regulatory, valuation, execution, macro risks. Max 150 words.`,

  catalysts: t =>
    `List the 3 biggest near-term catalysts for ${t} in exactly 3 bullet points. Each bullet includes timeframe.
Format: "• [Catalyst]: [explanation — Q/timeframe]"
Focus on: product launches, earnings, partnerships, regulatory approvals, market expansion. Max 150 words.`,
}

async function handleGroq(ticker, type, keys, kv) {
  const t     = ticker.toUpperCase()
  const kvKey = `${type}:${t}`
  const ttl   = TTL[type.toUpperCase()] || TTL.BEAR

  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  if (!keys.groq) return json({ error: 'Groq key not configured' }, 401)

  const prompt = GROQ_PROMPTS[type]?.(t)
  if (!prompt)  return json({ error: `Unknown AI type: ${type}` }, 400)

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${keys.groq}`,
    },
    body: JSON.stringify({
      model:      'llama-3.3-70b-versatile',
      max_tokens: 350,
      temperature: 0.3,
      messages:   [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)

  const gd      = await res.json()
  const text    = gd.choices?.[0]?.message?.content || ''
  const bullets = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('•'))

  const data = { ticker: t, type, text, bullets }

  const meta2 = buildMeta(t, type, ttl, false)
  await kvSet(kv, kvKey, data, ttl, meta2)
  return json({ data, meta: meta2 })
}

/* ── /api/earnings ───────────────────────────────────────── */
async function handleEarnings(keys, kv) {
  const kvKey = 'earnings:calendar'

  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)

  const from = new Date().toISOString().split('T')[0]
  const to   = new Date(Date.now() + 60 * 86_400_000).toISOString().split('T')[0]
  const raw  = await finnhubGet(`/calendar/earnings?from=${from}&to=${to}`, keys.finnhub)
  const data = raw.earningsCalendar || []

  const meta2 = buildMeta('', 'earnings', TTL.EARNINGS, false)
  await kvSet(kv, kvKey, data, TTL.EARNINGS, meta2)
  return json({ data, meta: meta2 })
}

/* ── /api/cache/info/:ticker — Data Freshness panel ──────── */
async function handleCacheInfo(ticker, kv) {
  const t = ticker.toUpperCase()
  const types = [
    { key: `fund:${t}`,         label: 'fundamentals' },
    { key: `price:${t}`,        label: 'price'        },
    { key: `ohlcv:${t}:3M`,     label: 'ohlcv'        },
    { key: `news:${t}`,         label: 'news'         },
    { key: `moat:${t}`,         label: 'moat'         },
    { key: `bear:${t}`,         label: 'bear'         },
    { key: `catalysts:${t}`,    label: 'catalysts'    },
    { key: 'earnings:calendar', label: 'earnings'     },
  ]

  const results = await Promise.all(
    types.map(async ({ key, label }) => {
      const { metadata } = await kvGet(kv, key)
      return [label, metadata || null]
    })
  )

  return json({ ticker: t, freshness: Object.fromEntries(results) })
}

/* ── /api/cache/clear/:ticker — Manual refresh trigger ───── */
async function handleCacheClear(ticker, kv) {
  const t = ticker.toUpperCase()
  const keys = [
    `fund:${t}`, `price:${t}`, `news:${t}`,
    `moat:${t}`, `bear:${t}`, `catalysts:${t}`,
    ...['1W','1M','3M','6M','1Y'].map(r => `ohlcv:${t}:${r}`),
  ]
  await Promise.all(keys.map(k => kv.delete(k)))
  return json({ ticker: t, cleared: keys, ok: true })
}

/* ════════════════════════════════════════════════════════════
   MODULE 6 — MAIN ROUTER
════════════════════════════════════════════════════════════ */
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url    = new URL(request.url)
    const parts  = url.pathname.replace(/^\/+/, '').split('/')
    const [root, type, param1, param2] = parts

    if (root !== 'api') {
      return json({ ok: false, message: 'TradePoint Worker v1.0 — use /api/' })
    }

    const kv      = env.TRADEPOINT_KV
    const keys    = getKeys(request, env)
    const refresh = url.searchParams.get('refresh') === '1'

    try {
      switch (type) {
        case 'status':
          return json({ ok: true, kv: !!kv, version: '1.0.0' })
        case 'fundamentals':
          return handleFundamentals(param1, keys, kv, refresh)
        case 'price':
          return handlePrice(param1, keys, kv)
        case 'ohlcv':
          return handleOHLCV(param1, param2, keys, kv)
        case 'news':
          return handleNews(param1, keys, kv)
        case 'moat':
        case 'bear':
        case 'catalysts':
          return handleGroq(param1, type, keys, kv)
        case 'earnings':
          return handleEarnings(keys, kv)
        case 'cache':
          if (param1 === 'info')  return handleCacheInfo(param2, kv)
          if (param1 === 'clear') return handleCacheClear(param2, kv)
          return json({ error: `Unknown cache action: ${param1}` }, 400)
        default:
          return json({ error: `Unknown endpoint: ${type}` }, 404)
      }
    } catch (err) {
      console.error('[TradePoint Worker]', err.message)
      return json({ error: err.message || 'Internal error' }, 500)
    }
  },
}
