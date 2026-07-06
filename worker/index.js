/**
 * TradePoint Lab — Cloudflare Worker v1.1
 * Fix: all handler calls now use `await` to properly catch async errors.
 * Fix: individual try-catch on each API call — partial data returned even if one fails.
 * Fix: FMP calls are optional (skipped if key not configured).
 */

/* ════════════════════════════════════════════════════════════
   MODULE 1 — CONFIG
════════════════════════════════════════════════════════════ */
const TTL = {
  PRICE:        5  * 60,
  OHLCV:        24 * 60 * 60,
  ANALYST:      24 * 60 * 60,
  NEWS:         8  * 60 * 60,
  EARNINGS:     7  * 24 * 60 * 60,
  FUNDAMENTALS: 90 * 24 * 60 * 60,
  MOAT:         30 * 24 * 60 * 60,
  BEAR:         7  * 24 * 60 * 60,
  CATALYSTS:    7  * 24 * 60 * 60,
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
  const res = await fetch(url, { ...opts, cf: { cacheTtl: 0 } })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.split('?')[0].split('/').slice(-2).join('/')}`)
  return res.json()
}

function getKeys(request, env) {
  const h = k => request.headers.get(k) || ''
  return {
    finnhub:      env.FINNHUB_KEY      || h('X-Finnhub-Key'),
    fmp:          env.FMP_KEY          || h('X-FMP-Key'),
    alpacaKey:    env.ALPACA_KEY       || h('X-Alpaca-Key'),
    alpacaSecret: env.ALPACA_SECRET    || h('X-Alpaca-Secret'),
    groq:         env.GROQ_KEY         || h('X-Groq-Key'),
  }
}

function buildMeta(ticker, type, ttlSec, fromCache) {
  const now = Date.now()
  return { ticker, type, fetchedAt: now, expiresAt: now + ttlSec * 1000, ttlSec, fromCache, source: fromCache ? 'kv' : 'api' }
}

async function kvGet(kv, key) {
  const { value, metadata } = await kv.getWithMetadata(key, 'json')
  return { value, metadata }
}

async function kvSet(kv, key, data, ttlSec, metadata) {
  await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSec, metadata })
}

/* ════════════════════════════════════════════════════════════
   MODULE 3 — API HELPERS (each call handles its own error)
════════════════════════════════════════════════════════════ */
async function fhGet(path, key) {
  if (!key) return null
  return fetchJSON(`https://finnhub.io/api/v1${path}&token=${key}`)
    .catch(e => { console.error('[Finnhub]', path.split('?')[0], e.message); return null })
}

async function fmpGet(path, key) {
  if (!key) return null
  return fetchJSON(`https://financialmodelingprep.com/api/v3${path}&apikey=${key}`)
    .catch(e => { console.error('[FMP]', path.split('?')[0], e.message); return null })
}

/* ════════════════════════════════════════════════════════════
   MODULE 4 — HANDLERS
════════════════════════════════════════════════════════════ */

const delay = ms => new Promise(r => setTimeout(r, ms))

async function handleFundamentals(ticker, keys, kv, forceRefresh) {
  const t     = ticker.toUpperCase()
  const kvKey = `fund:${t}`

  // KV cache check
  if (!forceRefresh) {
    const { value, metadata } = await kvGet(kv, kvKey)
    if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  }

  if (!keys.finnhub) {
    return json({ error: 'Finnhub key not configured — add it in Settings → API Keys' }, 401)
  }

  // Sequential Finnhub calls (avoids rate limit on 60 req/min free plan)
  const fhMetrics = await fhGet(`/stock/metric?symbol=${t}&metric=all`, keys.finnhub)
  await delay(150)
  const fhTarget  = await fhGet(`/stock/price-target?symbol=${t}`, keys.finnhub)
  await delay(150)
  const fhRecs    = await fhGet(`/stock/recommendation?symbol=${t}`, keys.finnhub)

  // FMP calls in parallel — try financial-ratios (better free plan coverage) + earnings
  const [fmpRatios, fmpCashFlow, fmpEarnings] = await Promise.all([
    fmpGet(`/financial-ratios/${t}?limit=1&period=annual`, keys.fmp),
    fmpGet(`/cash-flow-statement/${t}?limit=1&period=annual`, keys.fmp),
    fmpGet(`/earnings-surprises/${t}`, keys.fmp),
  ])

  const m   = fhMetrics?.metric || {}
  const rec = Array.isArray(fhRecs) ? (fhRecs[0] || {}) : {}
  const fr  = Array.isArray(fmpRatios)   ? (fmpRatios[0]   || {}) : {}
  const fc  = Array.isArray(fmpCashFlow) ? (fmpCashFlow[0]  || {}) : {}
  const earns = Array.isArray(fmpEarnings) ? fmpEarnings : []

  // Calculate FCF from cash flow statement if not in Finnhub
  const fcfFromFMP = (fc.operatingCashFlow != null && fc.capitalExpenditure != null)
    ? fc.operatingCashFlow + fc.capitalExpenditure  // capex is negative in FMP
    : null

  // Consecutive beats
  let consecutiveBeats = 0
  for (const e of earns) {
    if ((e.actualEarningResult ?? 0) > (e.estimatedEarning ?? 0)) consecutiveBeats++
    else break
  }
  const last = earns[0] || {}
  const epsSurprisePct = last.estimatedEarning
    ? ((last.actualEarningResult - last.estimatedEarning) / Math.abs(last.estimatedEarning)) * 100
    : null

  const data = {
    ticker: t,
    // Growth (Finnhub)
    revenueGrowthYoY: m.revenueGrowthTTMYoy          ?? null,
    revenueGrowth3Y:  m.revenueGrowth3Y               ?? null,
    revenueGrowth5Y:  m.revenueGrowth5Y               ?? null,
    epsGrowthYoY:     m.epsGrowthTTMYoy               ?? null,
    epsGrowth3Y:      m.epsGrowth3Y                   ?? null,
    epsGrowth5Y:      m.epsGrowth5Y                   ?? null,
    fcfTTM:           m.freeCashFlowTTM ?? fcfFromFMP  ?? null,
    fcfGrowth5Y:      m.freeCashFlowGrowth5Y          ?? null,
    // Quality (Finnhub)
    roe:              m.roeTTM                         ?? null,
    grossMargin:      m.grossMarginTTM                 ?? null,
    operatingMargin:  m.operatingMarginTTM             ?? null,
    netMargin:        m.netMarginTTM                   ?? null,
    // Strength (Finnhub)
    debtToEquity:     m['totalDebt/totalEquityAnnual'] ?? null,
    currentRatio:     m.currentRatioAnnual             ?? null,
    interestCoverage: m.interestCoverageAnnual         ?? null,
    // Valuation (Finnhub)
    pe:               m.peBasicExclExtraTTM ?? m.peTTM ?? null,
    evEbitda:         m['ev/ebitdaTTM']                ?? null,
    pFcf:             m.pfcfShareTTM                   ?? null,
    beta:             m.beta                           ?? null,
    // From FMP
    roic:             (fr.returnOnInvestedCapital != null ? fr.returnOnInvestedCapital * 100 : null),
    peg:              fr.priceEarningsToGrowthRatio     ?? null,
    fcfFromFMP:       fcfFromFMP,
    consecutiveBeats,
    epsSurprisePct,
    // Analyst consensus (Finnhub)
    targetMean:       fhTarget?.targetMean             ?? null,
    targetHigh:       fhTarget?.targetHigh             ?? null,
    targetLow:        fhTarget?.targetLow              ?? null,
    targetMedian:     fhTarget?.targetMedian           ?? null,
    strongBuy:        rec.strongBuy                    ?? 0,
    buy:              rec.buy                          ?? 0,
    hold:             rec.hold                         ?? 0,
    sell:             rec.sell                         ?? 0,
    strongSell:       rec.strongSell                   ?? 0,
    // Debug — tells the client which sources responded
    _sources: {
      finnhubMetric: !!fhMetrics,
      finnhubTarget: !!fhTarget,
      finnhubRecs:   !!fhRecs,
      fmpRatios:     !!fmpRatios,
      fmpCashFlow:   !!fmpCashFlow,
      fmpEarnings:   earns.length > 0,
    },
  }

  const meta2 = buildMeta(t, 'fundamentals', TTL.FUNDAMENTALS, false)
  await kvSet(kv, kvKey, data, TTL.FUNDAMENTALS, meta2)
  return json({ data, meta: meta2 })
}

async function handlePrice(ticker, keys, kv) {
  const t = ticker.toUpperCase()
  const kvKey = `price:${t}`
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)
  const raw = await fhGet(`/quote?symbol=${t}`, keys.finnhub)
  if (!raw) return json({ error: `Finnhub returned no data for ${t}` }, 502)
  const data = { ticker: t, price: raw.c, change: raw.d, changePct: raw.dp, high: raw.h, low: raw.l, open: raw.o, prevClose: raw.pc }
  const meta2 = buildMeta(t, 'price', TTL.PRICE, false)
  await kvSet(kv, kvKey, data, TTL.PRICE, meta2)
  return json({ data, meta: meta2 })
}

async function handleOHLCV(ticker, range, keys, kv) {
  const t = ticker.toUpperCase(), r = (range || '3M').toUpperCase()
  const kvKey = `ohlcv:${t}:${r}`
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  if (!keys.alpacaKey || !keys.alpacaSecret) return json({ error: 'Alpaca keys not configured' }, 401)
  const days = RANGE_DAYS[r] || 90
  const end   = new Date().toISOString().split('T')[0]
  const start = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]
  const raw = await fetchJSON(
    `https://data.alpaca.markets/v2/stocks/${t}/bars?timeframe=1Day&start=${start}&end=${end}&limit=500&feed=iex`,
    { headers: { 'APCA-API-KEY-ID': keys.alpacaKey, 'APCA-API-SECRET-KEY': keys.alpacaSecret } }
  )
  const data = (raw.bars || []).map(bar => ({
    date: new Date(bar.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: parseFloat(bar.c.toFixed(2)), open: bar.o, high: bar.h, low: bar.l, volume: bar.v,
  }))
  const meta2 = buildMeta(t, 'ohlcv', TTL.OHLCV, false)
  await kvSet(kv, kvKey, data, TTL.OHLCV, meta2)
  return json({ data, meta: meta2 })
}

async function handleNews(ticker, keys, kv) {
  const t = ticker.toUpperCase(), kvKey = `news:${t}`
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)
  const to = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0]
  const raw = await fhGet(`/company-news?symbol=${t}&from=${from}&to=${to}`, keys.finnhub)
  const data = (raw || []).slice(0, 15).map(n => ({ id: n.id, headline: n.headline, summary: n.summary, url: n.url, source: n.source, datetime: n.datetime, image: n.image, sentiment: n.sentiment }))
  const meta2 = buildMeta(t, 'news', TTL.NEWS, false)
  await kvSet(kv, kvKey, data, TTL.NEWS, meta2)
  return json({ data, meta: meta2 })
}

const GROQ_PROMPTS = {
  moat:      t => `Analyze the economic moat of ${t} in exactly 3 bullet points. Format: "• [Moat type]: [one sentence]". Focus: switching costs, network effects, cost advantages. Max 120 words.`,
  bear:      t => `List the 3 biggest risks for ${t} in exactly 3 bullet points. Format: "• [Risk]: [one sentence]". Max 120 words.`,
  catalysts: t => `List the 3 biggest near-term catalysts for ${t} in exactly 3 bullet points including timeframe. Format: "• [Catalyst]: [explanation + timeframe]". Max 120 words.`,
}

async function handleGroq(ticker, type, keys, kv) {
  const t = ticker.toUpperCase(), kvKey = `${type}:${t}`, ttl = TTL[type.toUpperCase()] || TTL.BEAR
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  if (!keys.groq) return json({ error: 'Groq key not configured' }, 401)
  const prompt = GROQ_PROMPTS[type]?.(t)
  if (!prompt) return json({ error: `Unknown AI type: ${type}` }, 400)
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.groq}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 300, temperature: 0.3, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const gd = await res.json()
  const text = gd.choices?.[0]?.message?.content || ''
  const bullets = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('•'))
  const data = { ticker: t, type, text, bullets }
  const meta2 = buildMeta(t, type, ttl, false)
  await kvSet(kv, kvKey, data, ttl, meta2)
  return json({ data, meta: meta2 })
}

async function handleEarnings(keys, kv) {
  const kvKey = 'earnings:calendar'
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)
  const from = new Date().toISOString().split('T')[0]
  const to   = new Date(Date.now() + 60 * 86_400_000).toISOString().split('T')[0]
  const raw  = await fhGet(`/calendar/earnings?from=${from}&to=${to}`, keys.finnhub)
  const data = raw?.earningsCalendar || []
  const meta2 = buildMeta('', 'earnings', TTL.EARNINGS, false)
  await kvSet(kv, kvKey, data, TTL.EARNINGS, meta2)
  return json({ data, meta: meta2 })
}

async function handleCacheInfo(ticker, kv) {
  const t = ticker.toUpperCase()
  const types = [
    { key: `fund:${t}`,      label: 'fundamentals' },
    { key: `price:${t}`,     label: 'price'        },
    { key: `ohlcv:${t}:3M`,  label: 'ohlcv'        },
    { key: `news:${t}`,      label: 'news'         },
    { key: `moat:${t}`,      label: 'moat'         },
    { key: `bear:${t}`,      label: 'bear'         },
    { key: `catalysts:${t}`, label: 'catalysts'    },
  ]
  const results = await Promise.all(types.map(async ({ key, label }) => {
    const { metadata } = await kvGet(kv, key)
    return [label, metadata || null]
  }))
  return json({ ticker: t, freshness: Object.fromEntries(results) })
}

async function handleCacheClear(ticker, kv) {
  const t = ticker.toUpperCase()
  const keys2 = [`fund:${t}`, `price:${t}`, `news:${t}`, `moat:${t}`, `bear:${t}`, `catalysts:${t}`,
    ...['1W','1M','3M','6M','1Y'].map(r => `ohlcv:${t}:${r}`)]
  await Promise.all(keys2.map(k => kv.delete(k)))
  return json({ ticker: t, cleared: keys2, ok: true })
}

/* ════════════════════════════════════════════════════════════
   MODULE 5 — ROUTER
   Critical fix: ALL handlers use `await` so async errors are
   properly caught by the outer try-catch.
════════════════════════════════════════════════════════════ */
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url   = new URL(request.url)
    const parts = url.pathname.replace(/^\/+/, '').split('/')
    const [root, type, param1, param2] = parts

    if (root !== 'api') {
      return json({ ok: true, message: 'TradePoint Worker v1.1 — use /api/', endpoints: ['status','fundamentals','price','ohlcv','news','moat','bear','catalysts','earnings','cache'] })
    }

    const kv      = env.TRADEPOINT_KV
    const keys    = getKeys(request, env)
    const refresh = url.searchParams.get('refresh') === '1'

    try {
      switch (type) {
        case 'status':
          return json({ ok: true, kv: !!kv, version: '1.1.0', keys: { finnhub: !!keys.finnhub, fmp: !!keys.fmp, alpaca: !!(keys.alpacaKey && keys.alpacaSecret), groq: !!keys.groq } })
        case 'fundamentals':
          return await handleFundamentals(param1, keys, kv, refresh)
        case 'price':
          return await handlePrice(param1, keys, kv)
        case 'ohlcv':
          return await handleOHLCV(param1, param2, keys, kv)
        case 'news':
          return await handleNews(param1, keys, kv)
        case 'moat':
        case 'bear':
        case 'catalysts':
          return await handleGroq(param1, type, keys, kv)
        case 'earnings':
          return await handleEarnings(keys, kv)
        case 'cache':
          if (param1 === 'info')  return await handleCacheInfo(param2, kv)
          if (param1 === 'clear') return await handleCacheClear(param2, kv)
          return json({ error: `Unknown cache action: ${param1}` }, 400)
        default:
          return json({ error: `Unknown endpoint: ${type}` }, 404)
      }
    } catch (err) {
      console.error('[Worker error]', type, param1, err.message)
      return json({ error: err.message || 'Internal Worker error', endpoint: type, ticker: param1 }, 500)
    }
  },
}
