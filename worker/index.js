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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    .catch(e => { console.error('[FMP v3]', path.split('?')[0], e.message); return null })
}

const delay = ms => new Promise(r => setTimeout(r, ms))

/** FMP /stable/ endpoints — newer API with different free plan coverage */
async function fmpStableGet(path, key) {
  if (!key) return null
  const sep = path.includes('?') ? '&' : '?'
  return fetchJSON(`https://financialmodelingprep.com/stable${path}${sep}apikey=${key}`)
    .catch(e => { console.error('[FMP stable]', path.split('?')[0], e.message); return null })
}

/* ════════════════════════════════════════════════════════════
   MODULE 4 — HANDLERS
════════════════════════════════════════════════════════════ */

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
  await delay(200)
  // Price target — retry once if first call fails
  let fhTarget = await fhGet(`/stock/price-target?symbol=${t}`, keys.finnhub)
  if (!fhTarget?.targetMean) { await delay(300); fhTarget = await fhGet(`/stock/price-target?symbol=${t}`, keys.finnhub) }
  await delay(200)
  const fhRecs    = await fhGet(`/stock/recommendation?symbol=${t}`, keys.finnhub)

  // FMP price target consensus (free plan — /stable/ endpoint)
  const fmpTarget = await fmpStableGet(`/price-target-consensus?symbol=${t}`, keys.fmp)

  // Finnhub earnings history — actual vs estimated per quarter (free plan)
  await delay(150)
  const fhEarnings = await fhGet(`/stock/earnings?symbol=${t}&limit=8`, keys.finnhub)

  const m     = fhMetrics?.metric || {}
  const rec   = Array.isArray(fhRecs) ? (fhRecs[0] || {}) : {}
  // Process Finnhub earnings (sorted newest first)
  const earns = Array.isArray(fhEarnings) ? fhEarnings : []

  // Count consecutive beats (newest → oldest)
  let consecutiveBeats = 0
  for (const e of earns) {
    if (e.actual != null && e.estimate != null && e.actual > e.estimate) consecutiveBeats++
    else break
  }
  const lastEarning   = earns[0] || {}
  const epsSurprisePct = lastEarning.surprisePercent ?? null

  // Calculate FCF TTM from EV / EV·FCF multiple
  const fcfTTM = (m.enterpriseValue && m['currentEv/freeCashFlowTTM'])
    ? Math.round(m.enterpriseValue / m['currentEv/freeCashFlowTTM'])
    : null

  const data = {
    ticker: t,
    // ── Growth ───────────────────────────────────────────────
    revenueGrowthYoY:  m.revenueGrowthTTMYoy           ?? null,
    revenueGrowth3Y:   m.revenueGrowth3Y                ?? null,
    revenueGrowth5Y:   m.revenueGrowth5Y                ?? null,
    epsGrowthYoY:      m.epsGrowthTTMYoy                ?? null,
    epsGrowth3Y:       m.epsGrowth3Y                    ?? null,
    epsGrowth5Y:       m.epsGrowth5Y                    ?? null,
    fcfTTM,                                              // calculated from EV/FCF
    fcfGrowth5Y:       m.focfCagr5Y                     ?? null,  // FCF CAGR 5Y
    ebitdaGrowth5Y:    m.ebitdaCagr5Y                   ?? null,
    // ── Quality ──────────────────────────────────────────────
    roe:               m.roeTTM                          ?? null,
    roi:               m.roiTTM                          ?? null,  // ROI ≈ ROIC proxy
    grossMargin:       m.grossMarginTTM                  ?? null,
    operatingMargin:   m.operatingMarginTTM              ?? null,
    netMargin:         m.netProfitMarginTTM              ?? null,  // FIXED name
    // ── Strength ─────────────────────────────────────────────
    debtToEquity:      m['totalDebt/totalEquityAnnual']  ?? null,
    currentRatio:      m.currentRatioAnnual              ?? null,
    interestCoverage:  m.netInterestCoverageTTM          ?? null,  // FIXED name
    // ── Valuation ────────────────────────────────────────────
    pe:                m.peBasicExclExtraTTM ?? m.peTTM  ?? null,
    peg:               m.pegTTM                          ?? null,  // Finnhub has it!
    forwardPE:         m.forwardPE                       ?? null,
    forwardPEG:        m.forwardPEG                      ?? null,
    evEbitda:          m.evEbitdaTTM                     ?? null,  // FIXED name
    evFcf:             m['currentEv/freeCashFlowTTM']    ?? null,
    pFcf:              m.pfcfShareTTM                    ?? null,
    beta:              m.beta                            ?? null,
    // ── Relative Strength vs S&P 500 (from Finnhub!) ─────────
    relStrength52W:    m['priceRelativeToS&P50052Week']  ?? null,
    relStrength13W:    m['priceRelativeToS&P50013Week']  ?? null,
    relStrength4W:     m['priceRelativeToS&P5004Week']   ?? null,
    // ── Analyst consensus — Finnhub preferred, FMP /stable/ as fallback ──
    // FMP returns array [{targetConsensus, targetHigh...}], Finnhub returns object
    targetMean:        fhTarget?.targetMean    ?? fmpTarget?.[0]?.targetConsensus ?? null,
    targetHigh:        fhTarget?.targetHigh    ?? fmpTarget?.[0]?.targetHigh      ?? null,
    targetLow:         fhTarget?.targetLow     ?? fmpTarget?.[0]?.targetLow       ?? null,
    targetMedian:      fhTarget?.targetMedian  ?? fmpTarget?.[0]?.targetMedian    ?? null,
    strongBuy:         rec.strongBuy                     ?? 0,
    buy:               rec.buy                          ?? 0,
    hold:              rec.hold                         ?? 0,
    sell:              rec.sell                         ?? 0,
    strongSell:        rec.strongSell                   ?? 0,
    consecutiveBeats,
    epsSurprisePct,
    // Debug — tells the client which sources responded
    _sources: {
      finnhubMetric:   !!fhMetrics,
      finnhubTarget:   !!(fhTarget?.targetMean || fmpTarget?.[0]?.targetConsensus),
      fmpPriceTarget:  !!fmpTarget?.targetConsensus,
      finnhubRecs:     !!fhRecs,
      finnhubEarnings: earns.length > 0,
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


/* ── /api/debug/:ticker — returns raw Finnhub metric fields ─ */
async function handleDebug(ticker, keys) {
  const t = ticker.toUpperCase()
  if (!keys.finnhub) return json({ error: 'No Finnhub key' }, 401)
  const raw      = await fhGet(`/stock/metric?symbol=${t}&metric=all`, keys.finnhub)
  await delay(200)
  const target   = await fhGet(`/stock/price-target?symbol=${t}`, keys.finnhub)
  await delay(200)
  const fhEarnings   = await fhGet(`/stock/earnings?symbol=${t}&limit=4`, keys.finnhub)
  const fmpPriceTarget = keys.fmp ? await fmpStableGet(`/price-target-consensus?symbol=${t}`, keys.fmp) : null
  return json({
    keys_configured:  { finnhub: !!keys.finnhub, fmp: !!keys.fmp },
    finnhubTarget:    target,
    fmpPriceTarget:   fmpPriceTarget,
    finnhubEarnings:  fhEarnings,
    status: {
      priceTarget:  !!(target?.targetMean || fmpPriceTarget?.targetConsensus) ? 'OK' : 'MISSING',
      earnings:     fhEarnings?.length > 0 ? 'OK' : 'EMPTY',
    },
  })
}


/* ════════════════════════════════════════════════════════════
   MODULE D1 — DATABASE HANDLERS
════════════════════════════════════════════════════════════ */

/** POST /api/save/:ticker — persist conviction result to D1 */
async function handleSaveAnalysis(ticker, request, db) {
  if (!db) return json({ error: 'D1 database not configured in Worker' }, 503)

  let body
  try { body = await request.json() }
  catch { return json({ error: 'Invalid JSON body' }, 400) }

  const r   = body
  const now = new Date()
  const bd  = r.breakdown ?? {}
  const nullFields = (bd.growth?.nullFields ?? 0) + (bd.quality?.nullFields ?? 0)
    + (bd.valuation?.nullFields ?? 0) + (bd.technical?.nullFields ?? 0)

  try {
    await db.prepare(`
      INSERT INTO analyses (
        ticker, analysis_date, timestamp_ms,
        raw_score, risk_penalty, final_score, gate_cap, active_gate,
        grade, confidence, model_version,
        growth_score, quality_score, strength_score, valuation_score, technical_score, valuation_metric,
        price, spy_price,
        target_mean, upside_pct, analysts,
        rsi, ema200, rs_weighted,
        sector_profile, null_fields, full_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      ticker.toUpperCase(),
      now.toISOString().split('T')[0],
      now.getTime(),
      r.rawScore        ?? null, r.riskPenalty    ?? null, r.finalScore ?? null,
      r.gateCap         ?? null, r.activeGate     ?? null,
      r.grade           ?? null, r.confidence     ?? null,
      r.audit?.modelVersion ?? 'v1.0',
      bd.growth?.score    ?? null, bd.quality?.score  ?? null,
      bd.strength?.score  ?? null, bd.valuation?.score ?? null,
      bd.technical?.score ?? null, bd.valuation?.metric ?? null,
      r.technical?.currentPrice ?? null, null,
      r.wallStreet?.targetMean ?? null, r.wallStreet?.upside ?? null,
      r.wallStreet?.analysts   ?? null,
      r.technical?.rsi        ?? null, r.technical?.ema200      ?? null,
      r.technical?.relStrengthWeighted ?? null,
      r.sectorProfile ?? null, nullFields,
      JSON.stringify(r)
    ).run()

    return json({ saved: true, ticker: ticker.toUpperCase(), date: now.toISOString().split('T')[0] })
  } catch (err) {
    console.error('[D1 save]', err.message)
    return json({ error: 'Database write failed: ' + err.message }, 500)
  }
}

/** GET /api/history/:ticker — retrieve analysis history from D1 */
async function handleGetHistory(ticker, db, limit = 90) {
  if (!db) return json({ error: 'D1 database not configured in Worker' }, 503)

  try {
    const rows = await db.prepare(`
      SELECT id, ticker, analysis_date, final_score, grade, confidence,
             growth_score, quality_score, strength_score, valuation_score, technical_score,
             active_gate, price, target_mean, upside_pct, rsi, rs_weighted, model_version
      FROM analyses WHERE ticker = ?
      ORDER BY timestamp_ms DESC LIMIT ?
    `).bind(ticker.toUpperCase(), limit).all()

    return json({ ticker: ticker.toUpperCase(), history: rows.results ?? [], count: rows.results?.length ?? 0 })
  } catch (err) {
    return json({ error: 'Database read failed: ' + err.message }, 500)
  }
}

/** GET /api/history — aggregate stats across all tickers */
async function handleGetAllHistory(db) {
  if (!db) return json({ error: 'D1 database not configured in Worker' }, 503)
  try {
    const stats = await db.prepare(`
      SELECT
        COUNT(*)                          AS total_analyses,
        COUNT(DISTINCT ticker)            AS unique_tickers,
        AVG(final_score)                  AS avg_score,
        MIN(analysis_date)                AS earliest,
        MAX(analysis_date)                AS latest,
        SUM(CASE WHEN grade='STRONG BUY'  THEN 1 ELSE 0 END) AS strong_buy_count,
        SUM(CASE WHEN grade='BUY'         THEN 1 ELSE 0 END) AS buy_count,
        SUM(CASE WHEN grade='HOLD'        THEN 1 ELSE 0 END) AS hold_count,
        SUM(CASE WHEN grade='SELL'        THEN 1 ELSE 0 END) AS sell_count,
        SUM(CASE WHEN grade='STRONG SELL' THEN 1 ELSE 0 END) AS strong_sell_count
      FROM analyses
    `).first()
    return json({ stats })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
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
    const db      = env.TRADEPOINT_DB ?? null
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
        case 'debug':
          return await handleDebug(param1, keys)
        case 'save':
          return await handleSaveAnalysis(param1, request, db)
        case 'history':
          if (!param1) return await handleGetAllHistory(db)
          return await handleGetHistory(param1, db)
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
