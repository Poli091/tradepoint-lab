import { computeConviction } from './conviction.js'

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
  OHLCV_LONG:   7  * 24 * 60 * 60,   // 7 days — long-range bars rarely change
  INSIDER:       6  * 60 * 60,         // 6 hours — insider filings updated intraday
  OHLCV:        24 * 60 * 60,
  ANALYST:      24 * 60 * 60,
  ANALYST_TARGET: 48 * 60 * 60,  // analyst targets + recommendations + earnings date
  NEWS:         8  * 60 * 60,
  EARNINGS:     7  * 24 * 60 * 60,
  FUNDAMENTALS: 90 * 24 * 60 * 60,
  MOAT:         30 * 24 * 60 * 60,
  BEAR:         7  * 24 * 60 * 60,
  CATALYSTS:    7  * 24 * 60 * 60,
}

/* ── Concurrency pool — reusable for batch prices & conviction ─────────
   Processes items with bounded parallelism, never failing the whole batch.
   Returns array of { status:'fulfilled', value } | { status:'rejected', reason }
──────────────────────────────────────────────────────────────────────── */
async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]) }
      } catch (err) {
        results[index] = { status: 'rejected', reason: err }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': [
    'Content-Type',
    'X-Finnhub-Key',
    'X-Alpaca-Key',  'X-Alpaca-Secret', 'X-Groq-Key',
  ].join(', '),
}

const RANGE_DAYS = {
  '1D':  1,    // intraday — 5Min bars, handled separately
  '1W':  10,   // 7 trading days + buffer
  '1M':  35,
  '3M':  95,
  '6M':  185,
  '1Y':  365,
  '2Y':  730,
  '5Y':  1825,
  'ALL': 3650,
  // YTD computed dynamically
}

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
    alpacaKey:    env.ALPACA_KEY       || h('X-Alpaca-Key'),
    alpacaSecret: env.ALPACA_SECRET    || h('X-Alpaca-Secret'),
    groq:         env.GROQ_KEY         || h('X-Groq-Key'),
    fred:         env.FRED_KEY         || h('X-Fred-Key'),
    adminKey:     env.TRADEPOINT_ADMIN_KEY ?? null,
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

/** Returns today's date in America/New_York as "YYYY-MM-DD".
 *  US-market app convention: analysis dates align with ET trading sessions.
 *  Cloudflare Workers support Intl.DateTimeFormat natively.
 */
function etDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)  // en-CA locale returns "YYYY-MM-DD"
}

/* ════════════════════════════════════════════════════════════
   MODULE 3 — API HELPERS (each call handles its own error)
════════════════════════════════════════════════════════════ */
async function fhGet(path, key) {
  if (!key) return null
  return fetchJSON(`https://finnhub.io/api/v1${path}&token=${key}`)
    .catch(e => { console.error('[Finnhub]', path.split('?')[0], e.message); return null })
}

const delay = ms => new Promise(r => setTimeout(r, ms))


/* ════════════════════════════════════════════════════════════
   MODULE 4 — HANDLERS
════════════════════════════════════════════════════════════ */

async function handleFundamentals(ticker, keys, kv, forceRefresh) {
  const t     = ticker.toUpperCase()
  const kvKey = `fund:${t}`

  // KV cache check — split TTL strategy:
  //   fund:TICKER     → 90 days (fundamentals, margins, EPS history)
  //   analyst:TICKER  → 48 hours (price targets, recommendations, earnings date)
  const analystKey = `analyst:${t}`

  if (!forceRefresh) {
    const { value: cached, metadata } = await kvGet(kv, kvKey)
    if (cached) {
      // Check if analyst sub-cache is also fresh
      const { value: analystCached } = await kvGet(kv, analystKey)
      if (analystCached) {
        // Both caches fresh — merge and return
        const merged = { ...cached, ...analystCached }
        return json({ data: merged, meta: { ...metadata, fromCache: true, analystFromCache: true } })
      }
      // Fundamentals fresh but analyst targets stale — re-fetch analyst fields only
      const freshAnalyst = await fetchAnalystFields(t, keys)
      if (freshAnalyst) {
        await kvSet(kv, analystKey, freshAnalyst, TTL.ANALYST_TARGET,
          buildMeta(t, 'analyst', TTL.ANALYST_TARGET, false))
        const merged = { ...cached, ...freshAnalyst }
        // Update main fund cache with fresh analyst data
        await kvSet(kv, kvKey, merged, TTL.FUNDAMENTALS, metadata ?? buildMeta(t, 'fundamentals', TTL.FUNDAMENTALS, false))
        return json({ data: merged, meta: { ...metadata, fromCache: true, analystRefreshed: true } })
      }
      // Could not re-fetch analyst — serve stale analyst from main cache
      return json({ data: cached, meta: { ...metadata, fromCache: true, analystStale: true } })
    }
  }

  if (!keys.finnhub) {
    return json({ error: 'Finnhub key not configured — add it in Settings → API Keys' }, 401)
  }

  // Sequential Finnhub calls (avoids rate limit on 60 req/min free plan)
  const fhMetrics = await fhGet(`/stock/metric?symbol=${t}&metric=all`, keys.finnhub)
  await delay(200)
  // Price target — retry once if first call fails, then fallback to Yahoo Finance
  let fhTarget = await fhGet(`/stock/price-target?symbol=${t}`, keys.finnhub)
  if (!fhTarget?.targetMean) { await delay(300); fhTarget = await fhGet(`/stock/price-target?symbol=${t}`, keys.finnhub) }
  // Finnhub free tier often returns null targetMean — fallback to Yahoo Finance
  let yhSummary = null
  if (!fhTarget?.targetMean) {
    yhSummary = await yahooQuoteSummary(t)
    if (yhSummary?.target?.targetMeanPrice) {
      fhTarget = {
        targetMean:   yhSummary.target.targetMeanPrice,
        targetHigh:   yhSummary.target.targetHighPrice,
        targetLow:    yhSummary.target.targetLowPrice,
        targetMedian: yhSummary.target.targetMedianPrice,
        _source:      'yahoo',
        _fetchedAt:   new Date().toISOString(),
      }
      console.log('[Fundamentals] Yahoo Finance price target for', t, fhTarget.targetMean)
    }
  }
  await delay(200)
  const fhRecs    = await fhGet(`/stock/recommendation?symbol=${t}`, keys.finnhub)

  // FMP price target consensus (free plan — /stable/ endpoint)

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
    // ── Analyst consensus — Finnhub primary, Yahoo Finance fallback ──
    targetSource:      fhTarget?._source ?? 'finnhub',
    targetFetchedAt:   fhTarget?._fetchedAt ?? null,   // When TradePoint fetched it — NOT the analyst revision date
    targetMean:        fhTarget?.targetMean ?? null,
    targetHigh:        fhTarget?.targetHigh    ?? null,
    targetLow:         fhTarget?.targetLow     ?? null,
    targetMedian:      fhTarget?.targetMedian  ?? null,
    strongBuy:         rec.strongBuy                     ?? 0,
    buy:               rec.buy                          ?? 0,
    hold:              rec.hold                         ?? 0,
    sell:              rec.sell                         ?? 0,
    strongSell:        rec.strongSell                   ?? 0,
    consecutiveBeats,
    epsSurprisePct,
    // ── Yahoo Finance supplemental data (informational only — no score impact) ──
    nextEarningsDate:  yhSummary?.nextEarnings ?? null,
    earningsDateSource: yhSummary?.nextEarnings ? 'yahoo' : null,
    instOwnership:     yhSummary?.instOwn      ?? null,
    // shortInfo computed below from FINRA (official) + Yahoo float ──────────
    shortInfo:         null,   // populated after FINRA fetch
    // Debug — tells the client which sources responded
    _sources: {
      finnhubMetric:   !!fhMetrics,
      finnhubTarget:   !!fhTarget,
      finnhubRecs:     !!fhRecs,
      finnhubEarnings: earns.length > 0,
    },
  }

  // FINRA short interest — official biweekly source.
  // Yahoo already fetched (yhSummary) — used for float shares to compute %.
  // Architecture: FINRA shares short + Yahoo float → short % float
  try {
    const finra = await finraShortInterest(t)
    if (finra?.sharesShort != null) {
      const yhShortInfo  = yhSummary?.shortInfo
      const floatShares  = yhSummary?.floatShares   // extracted from Yahoo ks.floatShares

      // Compute shortPct ourselves: FINRA shares ÷ Yahoo float
      // More transparent than using Yahoo's pre-computed value
      let shortPercentOfFloat = null
      let shortPctWarning     = null
      let shortInterestQuality = null
      if (floatShares != null && floatShares > 0) {
        const rawPct = (finra.sharesShort / floatShares) * 100
        shortPercentOfFloat = parseFloat(rawPct.toFixed(2))
        if (rawPct > 100) {
          // >100% is not impossible (repeated share lending) but most often indicates:
          // - settlement date mismatch between FINRA shares and Yahoo float
          // - outdated or imprecise float estimate from Yahoo
          // - symbol/unit mapping error
          // Do not assume rehypothecation — flag for review
          shortPctWarning = 'result_exceeds_100pct'
          shortInterestQuality = { status: 'warning', numeratorSource: 'finra',
            denominatorSource: 'yahoo', sameAsOfDate: false,
            note: 'Short interest exceeds reported float. Possible causes: repeated share lending, misaligned reporting dates, or inaccurate float estimate. Verify underlying data.' }
        } else {
          shortInterestQuality = { status: 'complete', numeratorSource: 'finra',
            denominatorSource: 'yahoo', sameAsOfDate: false }
        }
      } else {
        shortInterestQuality = { status: 'partial', numeratorSource: 'finra',
          denominatorSource: null, note: 'Float not available — short % cannot be computed.' }
      }

      const label = shortPercentOfFloat == null ? null
        : shortPercentOfFloat < 5  ? 'Low'
        : shortPercentOfFloat < 10 ? 'Moderate'
        : shortPercentOfFloat < 20 ? 'Elevated' : 'High'

      // Change vs prior: classify direction
      const chg = finra.percentChangePrev
      const changeTrend = chg == null ? null
        : chg <= -15 ? 'Falling materially'
        : chg >= 15  ? 'Rising materially' : 'Stable'

      data.shortInfo = {
        sharesShort:          finra.sharesShort,
        shortRatio:           finra.shortRatio    ?? yhShortInfo?.shortRatio ?? null,
        shortRatioSource:     finra.shortRatioSource ?? yhShortInfo?.shortRatioSource ?? null,
        shortPercentOfFloat,
        shortPctWarning,
        floatShares,
        settlementDate:       finra.settlementDate,
        percentChangePrev:    finra.percentChangePrev,
        changeTrend,
        label,
        source:       'finra',
        dataset:      finra.dataset,
        floatSource:  floatShares != null ? 'yahoo' : null,
        floatFetchedAt: Date.now(),
        quality:      shortInterestQuality,
      }
    } else {
      // FINRA returned no data for this ticker — fallback to Yahoo
      data.shortInfo = yhSummary?.shortInfo
        ? { ...yhSummary.shortInfo, source: 'yahoo_only',
            quality: { status: 'fallback', numeratorSource: 'yahoo', denominatorSource: 'yahoo',
              note: 'FINRA data unavailable for this ticker — using Yahoo pre-computed values.' } }
        : null
    }
  } catch(e) {
    console.warn('[Fundamentals] FINRA short interest failed:', t, e.message)
    data.shortInfo = yhSummary?.shortInfo ?? null
  }

  const meta2 = buildMeta(t, 'fundamentals', TTL.FUNDAMENTALS, false)
  await kvSet(kv, kvKey, data, TTL.FUNDAMENTALS, meta2)

  // Also cache analyst fields separately with 48h TTL
  const analystFields = {
    targetMean:        data.targetMean,
    targetHigh:        data.targetHigh,
    targetLow:         data.targetLow,
    targetMedian:      data.targetMedian,
    targetSource:      data.targetSource,
    targetFetchedAt:   data.targetFetchedAt,
    strongBuy:         data.strongBuy,
    buy:               data.buy,
    hold:              data.hold,
    sell:              data.sell,
    strongSell:        data.strongSell,
    nextEarningsDate:  data.nextEarningsDate,
    earningsDateSource:data.earningsDateSource,
  }
  await kvSet(kv, analystKey, analystFields, TTL.ANALYST_TARGET,
    buildMeta(t, 'analyst', TTL.ANALYST_TARGET, false))

  return json({ data, meta: meta2 })
}

/* ── Batch price endpoint: GET /api/prices?tickers=NVDA,AVGO,... ──────
   Architecture (Finnhub rate-limit aware):
   1. KV cache reads in parallel (free, fast)
   2. Misses → Alpaca multi-symbol snapshot (1 API call for all misses)
   3. Yahoo extended-hours complement (best-effort, 1s timeout)
   4. Finnhub fallback only for tickers Alpaca can't serve
   5. Never fail the whole batch for one bad ticker
──────────────────────────────────────────────────────────────────────── */
async function handleBatchPrices(url, keys, kv) {
  const t0 = Date.now()

  // Parse & validate tickers
  const rawParam = (url.searchParams.get('tickers') ?? '').toUpperCase()
  const requested = [...new Set(
    rawParam.split(',').map(t => t.trim()).filter(t => /^[A-Z]{1,10}$/.test(t))
  )].slice(0, 50)

  if (!requested.length) return json({ error: 'No valid tickers provided' }, 400)

  const prices = {}
  const errors = {}
  let cacheHits = 0, alpacaCalls = 0, finnhubFallbacks = 0, yahooFallbacks = 0, providerFailures = 0

  // Phase 1: KV cache reads — all in parallel (reads are free)
  const cacheResults = await Promise.all(
    requested.map(ticker => kvGet(kv, `price:${ticker}`).then(r => ({ ticker, ...r })))
  )
  const misses = []
  for (const { ticker, value } of cacheResults) {
    if (value) { prices[ticker] = { ...value, stale: false }; cacheHits++ }
    else misses.push(ticker)
  }

  // Phase 2: Alpaca multi-symbol snapshot — ONE API call for all misses
  // Alpaca IEX free: no per-ticker rate limit, supports multi-symbol in one request
  if (misses.length > 0 && keys.alpacaKey && keys.alpacaSecret) {
    alpacaCalls++
    const alpacaHdr = { 'APCA-API-KEY-ID': keys.alpacaKey, 'APCA-API-SECRET-KEY': keys.alpacaSecret }
    const symbolsParam = misses.join(',')
    const alpacaData = await fetchJSON(
      `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbolsParam}&feed=iex`,
      { headers: alpacaHdr }
    ).catch(e => { console.error('[Alpaca snapshots]', e.message); return null })

    if (alpacaData) {
      for (const ticker of misses) {
        const snap = alpacaData[ticker]
        if (!snap) continue

        // Deterministic price cascade: last trade → minute bar → daily bar
        // latestTrade must be reasonably fresh (within 24h for any session)
        const tradeAge = snap.latestTrade?.t
          ? (Date.now() - new Date(snap.latestTrade.t).getTime()) / 1000
          : Infinity
        const tradeIsFresh = tradeAge < 86400  // within 24h (covers after-hours, weekends)

        let latestPrice = null, priceType = null, priceAsOf = null
        if (snap.latestTrade?.p > 0 && tradeIsFresh) {
          latestPrice = snap.latestTrade.p; priceType = 'last_trade';  priceAsOf = snap.latestTrade.t
        } else if (snap.minuteBar?.c > 0) {
          latestPrice = snap.minuteBar.c;  priceType = 'minute_bar';  priceAsOf = snap.minuteBar.t
        } else if (snap.dailyBar?.c > 0) {
          latestPrice = snap.dailyBar.c;   priceType = 'daily_bar';   priceAsOf = snap.dailyBar.t
        }
        if (!latestPrice) continue

        const prevClose = snap.prevDailyBar?.c
        // Change vs IEX prevDailyBar close (not consolidated SIP)
        const change    = prevClose ? latestPrice - prevClose : null
        const changePct = change != null && prevClose ? (change / prevClose) * 100 : null

        const data = {
          ticker, price: latestPrice, change, changePct,
          high: snap.dailyBar?.h, low: snap.dailyBar?.l,
          open: snap.dailyBar?.o, prevClose,
          priceType,             // last_trade | minute_bar | daily_bar
          source: 'alpaca',
          feed: 'iex',           // IEX = subset of market, not consolidated SIP
          asOf: priceAsOf ?? new Date().toISOString(),
          preMarketPrice: null, preMarketChangePct: null,
          postMarketPrice: null, postMarketChangePct: null,
          phase: null, extSource: null,
        }
        prices[ticker] = { ...data, stale: false }
        const meta = buildMeta(ticker, 'price', TTL.PRICE, false)
        await kvSet(kv, `price:${ticker}`, data, TTL.PRICE, meta)
      }
    }
  }

  // Phase 3: Finnhub fallback for any tickers still missing after Alpaca
  // Rate limit aware: sequential with delay, only for remaining misses
  const stillMissing = misses.filter(t => !prices[t])
  if (stillMissing.length > 0 && keys.finnhub) {
    for (const ticker of stillMissing) {
      try {
        finnhubFallbacks++
        const raw = await fhGet(`/quote?symbol=${ticker}`, keys.finnhub)
        if (!raw?.c) throw new Error('quote_unavailable')
        const data = {
          ticker, price: raw.c, change: raw.d, changePct: raw.dp,
          high: raw.h, low: raw.l, open: raw.o, prevClose: raw.pc,
          preMarketPrice: null, preMarketChangePct: null,
          postMarketPrice: null, postMarketChangePct: null,
          phase: null, extSource: null,
          source: 'finnhub', asOf: new Date().toISOString(),
        }
        prices[ticker] = { ...data, stale: false }
        const meta = buildMeta(ticker, 'price', TTL.PRICE, false)
        await kvSet(kv, `price:${ticker}`, data, TTL.PRICE, meta)
        await delay(1100)  // respect 60 req/min on fallback path
      } catch(e) {
        errors[ticker] = e.message ?? 'fetch_error'
        providerFailures++
      }
    }
  }

  // Phase 4: Yahoo extended-hours complement (best-effort, 1s timeout)
  // Only run during pre/post market — skip during regular hours to save quota
  const nyHour = new Date().toLocaleString('en-US', { timeZone:'America/New_York', hour:'numeric', hour12:false })
  const isRegularHours = parseInt(nyHour) >= 9 && parseInt(nyHour) < 16
  if (!isRegularHours) {
    const freshTickers = Object.keys(prices).filter(t => misses.includes(t))
    for (const ticker of freshTickers.slice(0, 5)) {  // limit Yahoo calls too
      try {
        const yhFull = await Promise.race([
          yahooQuoteSummary(ticker),
          new Promise((_, rej) => setTimeout(() => rej(new Error('yahoo_timeout')), 1000))
        ])
        const yh = yhFull?.extHours
        if (yh) {
          const p = prices[ticker]
          if (yh.preMarketPrice  != null) { p.preMarketPrice  = yh.preMarketPrice;  p.preMarketChangePct  = yh.preMarketChangePct; p.phase = 'pre' }
          if (yh.postMarketPrice != null) { p.postMarketPrice = yh.postMarketPrice; p.postMarketChangePct = yh.postMarketChangePct; p.phase = 'post' }
          p.extSource = 'yahoo'
          yahooFallbacks++
        }
      } catch { /* skip */ }
    }
  }

  const durationMs = Date.now() - t0
  const alpacaReturned   = misses.filter(t => prices[t]?.source === 'alpaca').length
  const alpacaMissing    = misses.filter(t => !prices[t]).length + stillMissing.filter(t => !prices[t]).length

  // price_type_counts: how often each cascade level was used
  const priceTypeCounts = { last_trade: 0, minute_bar: 0, daily_bar: 0, other: 0 }
  for (const p of Object.values(prices)) {
    const k = p.priceType ?? 'other'
    priceTypeCounts[k] = (priceTypeCounts[k] ?? 0) + 1
  }
  // oldest_as_of_age_seconds: worst-case data age in the batch
  const now = Date.now()
  const ages = Object.values(prices)
    .map(p => p.asOf ? (now - new Date(p.asOf).getTime()) / 1000 : null)
    .filter(Boolean)
  const oldestAge = ages.length ? Math.round(Math.max(...ages)) : null

  console.log(JSON.stringify({
    event: 'batch_prices',
    duration_ms: durationMs,
    tickers: requested.length,
    cache_hits: cacheHits,
    cache_misses: misses.length,
    alpaca_calls: alpacaCalls,
    alpaca_symbols_requested: misses.length,
    alpaca_symbols_returned: alpacaReturned,
    alpaca_missing: alpacaMissing,
    finnhub_fallbacks: finnhubFallbacks,
    yahoo_extended_calls: yahooFallbacks,
    errors: providerFailures,
    price_type_counts: priceTypeCounts,
    oldest_as_of_age_seconds: oldestAge,
    has_errors: providerFailures > 0,
  }))

  return json({
    prices,
    errors: Object.keys(errors).length ? errors : undefined,
    meta: {
      requested: requested.length,
      returned:  Object.keys(prices).length,
      cacheHits, alpacaCalls, finnhubFallbacks, durationMs,
    },
  })
}

async function handlePrice(ticker, keys, kv) {
  const t = ticker.toUpperCase()
  const kvKey = `price:${t}`
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)
  const raw = await fhGet(`/quote?symbol=${t}`, keys.finnhub)
  if (!raw) return json({ error: `Finnhub returned no data for ${t}` }, 502)

  const data = {
    ticker: t,
    price:      raw.c,
    change:     raw.d,
    changePct:  raw.dp,
    high:       raw.h,
    low:        raw.l,
    open:       raw.o,
    prevClose:  raw.pc,
    // Extended hours — Finnhub free doesn't provide these; filled from Yahoo
    preMarketPrice:      null,
    preMarketChangePct:  null,
    postMarketPrice:     null,
    postMarketChangePct: null,
    phase:               null,   // PRE | REGULAR | POST | CLOSED
    extSource:           null,
  }

  // Yahoo Finance for extended-hours prices (pre-market, after-hours)
  // Use short TTL for price data (5 min) — same as Finnhub
  try {
    const yhFull = await yahooQuoteSummary(t)
    const yh = yhFull?.extHours
    if (yh) {
      data.phase = yh.phase
      // Pre-market: before 9:30 AM ET
      if (yh.preMarketPrice != null)  { data.preMarketPrice  = yh.preMarketPrice;  data.preMarketChangePct  = yh.preMarketChangePct  }
      // After-hours: after 4:00 PM ET
      if (yh.postMarketPrice != null) { data.postMarketPrice = yh.postMarketPrice; data.postMarketChangePct = yh.postMarketChangePct }
      // Use prevClose from Yahoo if Finnhub didn't return it
      if (!data.prevClose && yh.prevClose) data.prevClose = yh.prevClose
      data.extSource = 'yahoo'
    }
  } catch(e) { console.warn('[handlePrice] Yahoo extended hours failed:', t, e.message) }

  const meta2 = buildMeta(t, 'price', TTL.PRICE, false)
  await kvSet(kv, kvKey, data, TTL.PRICE, meta2)
  return json({ data, meta: meta2 })
}

/* ── OHLCV bar date formatter ────────────────────────────────────────── */
function formatBarDate(isoDate, res) {
  const d = new Date(isoDate + 'T12:00:00Z')
  if (res === 'M') return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

/* ── Long-range handler: 2Y / 5Y / ALL via Alpaca daily → D1 + KV ──────
   Fetches in 1-year segments from Alpaca (daily bars), building full history.
   D1 is the persistent store — subsequent loads only fetch new bars.
   Finnhub /stock/candle free tier ignores `from` and returns ~90d max.
   Alpaca IEX daily bars available for several years on the free plan.
───────────────────────────────────────────────────────────────────── */
async function handleLongRangeOHLCV(ticker, range, keys, kv, db) {
  const t      = ticker.toUpperCase()
  const kvKey  = `ohlcv:${t}:${range}`
  const calDays = range === '2Y' ? 730 : range === '5Y' ? 1825 : 3650
  const rangeStart = new Date(Date.now() - calDays * 86_400_000).toISOString().split('T')[0]

  // Layer 1: KV (7-day cache)
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  // Layer 2: D1 (permanent bar store — daily resolution)
  let storedBars = []
  if (db) {
    try {
      const rows = await db.prepare(
        `SELECT bar_date, close, open, high, low, volume FROM ohlcv_bars
         WHERE ticker = ? AND res = ? AND bar_date >= ?
         ORDER BY bar_date ASC`
      ).bind(t, 'D', rangeStart).all()
      storedBars = rows.results ?? []
    } catch (e) { console.error('[D1 OHLCV read]', e.message) }
  }

  const lastStored   = storedBars.length > 0 ? storedBars[storedBars.length - 1] : null
  const oldestStored = storedBars.length > 0 ? storedBars[0].bar_date : null
  const daysSinceLast = lastStored
    ? (Date.now() - new Date(lastStored.bar_date + 'T12:00:00Z').getTime()) / 86_400_000
    : Infinity

  // TWO independent reasons to fetch from Alpaca:
  //  1. needsHistory: D1 doesn't cover the full requested range
  //  2. needsRecent:  last bar is older than 8 days
  // Bug fix: previously wrapping BOTH in `if (daysSinceLast > 8)` meant
  // tickers with recent-but-short D1 history (e.g. NVDA with 1Y of bars)
  // never fetched the older segments for 2Y/5Y/ALL ranges.
  const needsHistory = !oldestStored || oldestStored > rangeStart
  const needsRecent  = daysSinceLast > 8

  let allBars = [...storedBars]

  if (needsHistory || needsRecent) {
    if (!keys.alpacaKey || !keys.alpacaSecret) {
      if (storedBars.length) {
        const data = storedBars.map(b => ({
          date: formatBarDate(b.bar_date, 'D'),
          price: parseFloat(b.close.toFixed(2)), open: b.open, high: b.high, low: b.low, volume: b.volume
        }))
        const meta2 = buildMeta(t, 'ohlcv', TTL.OHLCV_LONG, true)
        await kvSet(kv, kvKey, data, TTL.OHLCV_LONG, meta2)
        return json({ data, meta: { ...meta2, source: 'd1_stale' } })
      }
      return json({ error: 'Alpaca keys required for long-range chart data' }, 401)
    }

    const alpacaHdr = { 'APCA-API-KEY-ID': keys.alpacaKey, 'APCA-API-SECRET-KEY': keys.alpacaSecret }
    const nowMs     = Date.now()
    const segYears  = range === '2Y' ? 2 : range === '5Y' ? 5 : 10
    const allNewBars = []

    for (let i = segYears - 1; i >= 0; i--) {
      const segEndMs   = nowMs - i * 365 * 86_400_000
      const segStartMs = nowMs - (i + 1) * 365 * 86_400_000
      const segEnd   = new Date(segEndMs).toISOString().split('T')[0]
      const segStart = new Date(segStartMs).toISOString().split('T')[0]

      // Skip historical segments already in D1 — but always fetch most recent segment
      const isRecentSegment = i === 0
      if (!isRecentSegment && oldestStored && segStart >= oldestStored) continue
      if (isRecentSegment && !needsRecent && oldestStored && segStart >= oldestStored) continue

      let segBars = []
      const raw = await fetchJSON(
        `https://data.alpaca.markets/v2/stocks/${t}/bars?timeframe=1Day&start=${segStart}&end=${segEnd}&limit=300&feed=iex&adjustment=split`,
        { headers: alpacaHdr }
      ).catch(e => { console.error('[Alpaca segment]', t, i, e.message); return null })

      if (raw?.bars?.length > 0) {
        segBars = raw.bars.map(bar => ({
          bar_date: new Date(bar.t).toISOString().split('T')[0],
          close: parseFloat(bar.c.toFixed(2)), open: bar.o, high: bar.h, low: bar.l, volume: bar.v,
        }))
      }

      // Fallback to Yahoo Finance if Alpaca returns nothing for this segment
      // NOTE: Yahoo v8 returns split-adjusted close (adjclose) by default.
      // Alpaca IEX uses adjustment=split. Both should be split-adjusted — verify continuity.
      if (segBars.length === 0) {
        console.log('[OHLCV] Alpaca empty for', t, segStart, '— trying Yahoo Finance (split-adjusted)')
        const yhRange = segYears <= 2 ? '2y' : segYears <= 5 ? '5y' : '10y'
        if (i === 0) {
          const yhBars = await yahooOHLCV(t, yhRange)
          segBars = yhBars
            .filter(b => b.bar_date >= segStart && b.bar_date <= segEnd)
            .map(b => ({ ...b, _source: 'yahoo', _adjustment: 'split_adjusted' }))
        }
      }

      allNewBars.push(...segBars)
    }

    if (allNewBars.length > 0) {
      // Save to D1 in chunks of 75 — D1 hard limit is 100 statements per batch.
      // 250 bars × 2 segments = 500 rows would silently fail as one batch.
      if (db) {
        const CHUNK = 75
        const stmt  = db.prepare(
          'INSERT OR IGNORE INTO ohlcv_bars (ticker, bar_date, res, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        for (let ci = 0; ci < allNewBars.length; ci += CHUNK) {
          try {
            const chunk = allNewBars.slice(ci, ci + CHUNK)
            await db.batch(chunk.map(b => stmt.bind(t, b.bar_date, 'D', b.open, b.high, b.low, b.close, b.volume)))
          } catch (e) { console.error('[D1 OHLCV chunk]', t, ci, e.message) }
        }
      }

      // Merge + deduplicate + sort
      const seen = new Set(storedBars.map(b => b.bar_date))
      for (const b of allNewBars) { if (!seen.has(b.bar_date)) { allBars.push(b); seen.add(b.bar_date) } }
      allBars.sort((a, b) => a.bar_date.localeCompare(b.bar_date))

      // Continuity validation — flags boundary gaps and data quality issues
      const continuity = validateOHLCV(allBars)
      if (continuity.events) {
        console.warn('[OHLCV continuity]', t, range, continuity.status, JSON.stringify(continuity.events.slice(0,3)))
      }
    }
  }

  if (!allBars.length) return json({ data: [], meta: buildMeta(t, 'ohlcv', TTL.OHLCV_LONG, false) })

  const data = allBars.map(b => ({
    date:  formatBarDate(b.bar_date, 'D'),
    price: parseFloat(b.close.toFixed(2)),
    open:  b.open, high: b.high, low: b.low, volume: b.volume,
  }))

  const meta2 = buildMeta(t, 'ohlcv', TTL.OHLCV_LONG, false)
  await kvSet(kv, kvKey, data, TTL.OHLCV_LONG, meta2)
  return json({ data, meta: meta2 })
}


/* ── Short-range handler: 1D / 1W / 1M / 6M / YTD / 1Y via Alpaca ───── */
async function handleOHLCV(ticker, range, keys, kv, db) {
  const t = ticker.toUpperCase()
  const r = (range || '3M').toUpperCase()

  // Route long ranges to Finnhub + D1 handler
  if (r === '2Y' || r === '5Y' || r === 'ALL') return handleLongRangeOHLCV(t, r, keys, kv, db)

  const kvKey = `ohlcv:${t}:${r}`
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  if (!keys.alpacaKey || !keys.alpacaSecret)
    return json({ error: 'Alpaca keys not configured' }, 401)

  const alpacaHdr = { 'APCA-API-KEY-ID': keys.alpacaKey, 'APCA-API-SECRET-KEY': keys.alpacaSecret }
  let data, cacheTtl

  if (r === '1D') {
    // Use NY timezone for trading date — cron fires at 22:00 UTC which may be next day UTC
  const today = new Date().toLocaleString('en-CA', { timeZone: 'America/New_York' }).split(',')[0].trim()
    const raw = await fetchJSON(
      `https://data.alpaca.markets/v2/stocks/${t}/bars?timeframe=5Min&start=${today}&limit=200&feed=iex&adjustment=split`,
      { headers: alpacaHdr }
    )
    data = (raw.bars || []).map(bar => ({
      date:  new Date(bar.t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      price: parseFloat(bar.c.toFixed(2)), open: bar.o, high: bar.h, low: bar.l, volume: bar.v,
    }))
    cacheTtl = 5 * 60
  } else if (r === 'YTD') {
    const now   = new Date()
    const start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
    const end   = now.toISOString().split('T')[0]
    const raw = await fetchJSON(
      `https://data.alpaca.markets/v2/stocks/${t}/bars?timeframe=1Day&start=${start}&end=${end}&limit=500&feed=iex&adjustment=split`,
      { headers: alpacaHdr }
    )
    data = (raw.bars || []).map(bar => ({
      date:  new Date(bar.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: parseFloat(bar.c.toFixed(2)), open: bar.o, high: bar.h, low: bar.l, volume: bar.v,
    }))
    cacheTtl = TTL.OHLCV
  } else {
    const calDays = RANGE_DAYS[r] || 95
    const end     = new Date().toISOString().split('T')[0]
    const start   = new Date(Date.now() - calDays * 86_400_000).toISOString().split('T')[0]
    const raw = await fetchJSON(
      `https://data.alpaca.markets/v2/stocks/${t}/bars?timeframe=1Day&start=${start}&end=${end}&limit=600&feed=iex&adjustment=split`,
      { headers: alpacaHdr }
    )
    data = (raw.bars || []).map(bar => ({
      date:  new Date(bar.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: parseFloat(bar.c.toFixed(2)), open: bar.o, high: bar.h, low: bar.l, volume: bar.v,
    }))
    cacheTtl = TTL.OHLCV
  }

  const meta2 = buildMeta(t, 'ohlcv', cacheTtl, false)
  await kvSet(kv, kvKey, data, cacheTtl, meta2)
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

function buildPrompt(type, ticker, fund, score) {
  const bd         = score?.breakdown
  const finalScore = score?.finalScore ?? 'N/A'
  const grade      = score?.grade      ?? 'N/A'
  const tech       = score?.technical  ?? {}
  const f          = fund ?? {}

  // ── Component classification ──────────────────────────────────────────
  const DIMS = [
    { name:'Growth',    score: bd?.growth?.score,    max:25 },
    { name:'Quality',   score: bd?.quality?.score,   max:20 },
    { name:'Strength',  score: bd?.strength?.score,  max:15 },
    { name:'Valuation', score: bd?.valuation?.score, max:15 },
    { name:'Technical', score: bd?.technical?.score, max:15 },
  ].filter(d => d.score != null)

  const eff    = d => Math.round((d.score / d.max) * 100)
  const strong = DIMS.filter(d => eff(d) >= 65).sort((a,b) => eff(b)-eff(a))
  const weak   = DIMS.filter(d => eff(d) <  50).sort((a,b) => eff(a)-eff(b))
  const best   = [...DIMS].sort((a,b) => eff(b)-eff(a))[0]
  const riskPen = bd?.risk?.penalty ?? 0

  // ── Valuation: only the metric actually used ──────────────────────────
  const valMetric = bd?.valuation?.metric
  const valValue  = bd?.valuation?.value

  // ── Sub-score computation trace (deterministic — same logic as engine) ─
  const sRev = v => v==null?null : v>25?8:v>=15?6:v>=10?4:v>=0?2:0
  const sFCF = v => v==null?null : v>20?5:v>=10?3:v>=0?2:0
  const sROI = v => v==null?null : v>20?8:v>=15?6:v>=10?4:v>=8?2:0
  const sNM  = v => v==null?null : v>25?7:v>=15?5:v>=10?3:v>=0?1:0
  const sGM  = v => v==null?null : v>60?5:v>=40?3:v>=20?2:0
  const bestROI = Math.max(f.roic??-Infinity, f.roi??-Infinity, f.roe??-Infinity)
  const deRaw   = f.debtToEquity
  const deScore = deRaw==null?null : deRaw<=0.5?5:deRaw<=1?4:deRaw<=2?3:deRaw<=4?1:0
  const crScore = f.currentRatio==null?null : f.currentRatio>=2?5:f.currentRatio>=1.5?4:f.currentRatio>=1?3:f.currentRatio>=0.8?1:0
  const icScore = f.interestCoverage==null?null : f.interestCoverage>=10?5:f.interestCoverage>=5?4:f.interestCoverage>=3?3:f.interestCoverage>=1?1:0

  const row = (label, val, s, m) => s!=null ? `  ${label}: ${val} → [${s}/${m}]` : null

  const trace = [
    `=== COMPUTATION TRACE: ${ticker} | ${finalScore}/100 ${grade} ===`,
    `Strong: ${strong.map(d=>`${d.name} ${d.score}/${d.max} (${eff(d)}%)`).join(', ')||'none'}`,
    `Weak:   ${weak.map(d=>`${d.name} ${d.score}/${d.max} (${eff(d)}%)`).join(', ')||'none'}`,
    '',
    `Growth → ${bd?.growth?.score??'?'}/25`,
    row('Revenue YoY', `+${f.revenueGrowthYoY?.toFixed(1)??'N/A'}%`, sRev(f.revenueGrowthYoY), 8),
    row('EPS YoY',     `${f.epsGrowthYoY?.toFixed(1)??'N/A'}%`,      sRev(f.epsGrowthYoY),     8),
    row('FCF CAGR',    `${f.fcfGrowth5Y?.toFixed(1)??'N/A'}%`,       sFCF(f.fcfGrowth5Y),      5),
    '',
    `Quality → ${bd?.quality?.score??'?'}/20`,
    row('Best ROE/ROIC', `${isFinite(bestROI)?bestROI.toFixed(1):'N/A'}%`, sROI(isFinite(bestROI)?bestROI:null), 8),
    row('Net Margin',    `${f.netMargin?.toFixed(1)??'N/A'}%`,    sNM(f.netMargin),  7),
    row('Gross Margin',  `${f.grossMargin?.toFixed(1)??'N/A'}%`,  sGM(f.grossMargin),5),
    '',
    `Strength → ${bd?.strength?.score??'?'}/15`,
    row('Leverage (D/E)',    f.debtToEquity?.toFixed(2)??'N/A',  deScore, 5),
    row('Liquidity (CR)',    f.currentRatio?.toFixed(1)??'N/A',  crScore, 5),
    row('Coverage (IC)',     `${f.interestCoverage?.toFixed(1)??'N/A'}x`, icScore, 5),
    '',
    valMetric && valValue != null
      ? `Valuation → ${bd?.valuation?.score??'?'}/15 (method: ${valMetric} = ${valValue.toFixed(1)}x)`
      : `Valuation → ${bd?.valuation?.score??'?'}/15 (method: ${valMetric??'unavailable'})`,
    '',
    `Technical → ${bd?.technical?.score??'?'}/15`,
    `  EMA200: $${tech.ema200?.toFixed(2)??'N/A'} → price ${tech.aboveEMA200?'above [5/5]':'below [0/5]'}`,
    `  RS vs SPY: ${tech.relStrengthWeighted?.toFixed(1)??'N/A'}%`,
    `  RSI: ${tech.rsi?.toFixed(1)??'N/A'}`,
    riskPen < 0 ? `\nRisk penalty: ${riskPen} (Beta ${f.beta?.toFixed(2)??'N/A'})` : '',
    '==============================================',
  ].filter(l => l !== null && l !== false).join('\n')

  // ── ROLE: interpreter not analyst ────────────────────────────────────
  const ROLE = `You are an interpreter for TradePoint Lab's conviction engine — not a financial analyst.

The computation trace above shows exactly how the engine built each score.
The UI already displays all the numbers. Your job is to add ONE interpretation paragraph
explaining the WHY behind the computation — not to repeat the numbers.

Think like a debugger adding a comment above a function that computed an unexpected result.`

  const RULES = `Rules:
- 2-3 sentences maximum, plain and direct
- Be direct and affirmative: "Quality scores well because ROE is X%" not "Quality suggests the company may have..."
- Never use: "suggests", "could potentially", "may be able", "this indicates that"
- Never repeat numbers already in the trace unless it adds interpretive value  
- Reference scoring buckets not invented targets: "into a higher scoring range" not "below 40x"
- Never recommend buying or selling`

  const moat  = `${ROLE}

${trace}

TASK: Write 1 short paragraph (2-3 sentences) interpreting why the STRONG components scored well.
${strong.length===0?`No components above 65%. Write: "No component currently scores above 65% efficiency — the highest-scoring area is ${best?.name??'N/A'} at ${best?.score??0}/${best?.max??0}."` : `Focus on: ${strong.map(d=>d.name).join(', ')}`}

${RULES}`

  const bear  = `${ROLE}

${trace}

TASK: Write 1 short paragraph (2-3 sentences) interpreting why the WEAK components scored low.
Focus on what the computation trace reveals about the trade-offs within each weak component.
${riskPen < 0 ? `Include the Risk penalty in your interpretation.` : ''}

${RULES}
- For Strength: if one sub-score is high (e.g. Coverage 5/5) but others are low, explain the contrast
- For Valuation: reference ONLY ${valMetric??'the method used'} — never invent other metrics
- Beta is statistical — changes only with sustained lower volatility, not from events`

  const cats  = `${ROLE}

${trace}

TASK: Write 1 short paragraph (2-3 sentences) describing what would need to change in the computation
to improve the WEAK components. Speak in terms of the scoring buckets, not invented thresholds.

${RULES}
- "into a higher scoring range" not "D/E must fall below X"
- Reference EMA200 ($${tech.ema200?.toFixed(0)??'N/A'}) and RS vs SPY as Technical's specific levers
- For Valuation: "lower ${valMetric??'the metric used'} ${valValue!=null?'from '+valValue.toFixed(1)+'x':''} into a higher bucket"`

  return { moat, bear, catalysts: cats }[type] ?? null
}

async function handleGroq(ticker, type, keys, kv) {
  const t = ticker.toUpperCase(), kvKey = `${type}:${t}`, ttl = TTL[type.toUpperCase()] || TTL.BEAR
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })
  if (!keys.groq) return json({ error: 'Groq key not configured' }, 401)
  // Read cached fundamentals + OHLCV to compute score and ground the prompt
  const fund     = await kv.get(`fund:${t}`, 'json').catch(() => null)
  const ohlcv    = await kv.get(`ohlcv:${t}:1Y`, 'json').catch(() => [])
  const spyOhlcv = await kv.get('ohlcv:SPY:1Y', 'json').catch(() => [])
  const priceD   = await kv.get(`price:${t}`, 'json').catch(() => null)
  // Compute conviction score so Groq knows Technical/Valuation breakdown
  const score = fund ? computeConviction(fund, ohlcv ?? [], spyOhlcv ?? [], priceD?.price ?? null) : null
  const prompt = buildPrompt(type, t, fund, score)
  if (!prompt) return json({ error: `Unknown AI type: ${type}` }, 400)
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.groq}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 600, temperature: 0.3, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const gd = await res.json()
  const text = gd.choices?.[0]?.message?.content || ''

  // Try bullet extraction first (for backward compat)
  const bullets = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('•') || l.startsWith('-') || l.startsWith('*') || /^\d+\./.test(l))
    .map(l => l.replace(/^[-*•]\s*|^\d+\.\s*/, ''))
    .filter(l => l.length > 10)

  // If no bullets found, use the raw text as a paragraph (new paragraph mode)
  // The UI handles both: data.bullets (old) and data.text (new paragraph mode)
  const cleanText = text.trim().replace(/^#+\s+.*\n?/gm, '').trim()  // strip markdown headers
  // Debug: log what Groq returned
  console.log(`[Groq/${type}/${t}] raw length: ${text.length}, bullets: ${bullets.length}, cleanText length: ${cleanText.length}`)
  if (text.length > 0 && cleanText.length === 0) {
    console.log(`[Groq/${type}/${t}] WARNING: text was stripped to empty. Raw: ${text.slice(0, 200)}`)
  }

  const data = {
    ticker: t,
    type,
    text:    cleanText.length > 0 ? cleanText : text.trim(), // fallback to unstripped text
    bullets,
    rawLength: text.length, // for debugging
  }
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
  const keys2 = [
    `fund:${t}`, `price:${t}`, `news:${t}`,
    `moat:${t}`, `bear:${t}`, `catalysts:${t}`,
    `market_intel:${t}`,   // market intelligence
    `insider:${t}`,        // SEC EDGAR insider activity
    ...['1D','1W','1M','3M','6M','YTD','1Y','2Y','5Y','ALL'].map(r => `ohlcv:${t}:${r}`),
  ]
  await Promise.all(keys2.map(k => kv.delete(k)))
  return json({ ticker: t, cleared: keys2.length, ok: true })
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
  return json({
    keys_configured:  { finnhub: !!keys.finnhub },
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

  const r          = body
  const now        = new Date()
  const today      = etDate(now)   // Eastern Time — aligns with US market sessions
  const bd         = r.breakdown ?? {}
  const nullFields = (bd.growth?.nullFields ?? 0) + (bd.quality?.nullFields ?? 0)
    + (bd.valuation?.nullFields ?? 0) + (bd.technical?.nullFields ?? 0)

  // Upsert: one canonical row per (ticker, analysis_date).
  // ON CONFLICT DO UPDATE ensures today's row always reflects the latest run —
  // no threshold filtering, no missed component/gate/upside changes.
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
      ON CONFLICT(ticker, analysis_date) DO UPDATE SET
        timestamp_ms    = excluded.timestamp_ms,
        raw_score       = excluded.raw_score,
        risk_penalty    = excluded.risk_penalty,
        final_score     = excluded.final_score,
        gate_cap        = excluded.gate_cap,
        active_gate     = excluded.active_gate,
        grade           = excluded.grade,
        confidence      = excluded.confidence,
        model_version   = excluded.model_version,
        growth_score    = excluded.growth_score,
        quality_score   = excluded.quality_score,
        strength_score  = excluded.strength_score,
        valuation_score = excluded.valuation_score,
        technical_score = excluded.technical_score,
        valuation_metric= excluded.valuation_metric,
        price           = excluded.price,
        target_mean     = excluded.target_mean,
        upside_pct      = excluded.upside_pct,
        analysts        = excluded.analysts,
        rsi             = excluded.rsi,
        ema200          = excluded.ema200,
        rs_weighted     = excluded.rs_weighted,
        sector_profile  = excluded.sector_profile,
        null_fields     = excluded.null_fields,
        full_json       = excluded.full_json
    `).bind(
      ticker.toUpperCase(), today, now.getTime(),
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
      r.sectorProfile ?? null, nullFields, JSON.stringify(r)
    ).run()

    return json({ saved: true, upserted: true, ticker: ticker.toUpperCase(), date: today })
  } catch (err) {
    console.error('[D1 save]', err.message)
    return json({ error: 'Database write failed: ' + err.message }, 500)
  }
}

/** GET /api/history/:ticker — retrieve analysis history from D1 */
async function handleGetHistory(ticker, db, limit = 90) {
  if (!db) return json({ error: 'D1 database not configured in Worker' }, 503)

  try {
    // One row per day: latest analysis for that day (MAX timestamp_ms)
    const rows = await db.prepare(`
      SELECT a.analysis_date, a.final_score, a.grade, a.confidence,
             a.growth_score, a.quality_score, a.strength_score, a.valuation_score, a.technical_score,
             a.active_gate, a.price, a.target_mean, a.upside_pct, a.rsi, a.rs_weighted, a.model_version
      FROM analyses a
      INNER JOIN (
        SELECT analysis_date, MAX(timestamp_ms) AS max_ts
        FROM analyses WHERE ticker = ?
        GROUP BY analysis_date
      ) latest ON a.analysis_date = latest.analysis_date AND a.timestamp_ms = latest.max_ts
      WHERE a.ticker = ?
      ORDER BY a.analysis_date ASC
      LIMIT ?
    `).bind(ticker.toUpperCase(), ticker.toUpperCase(), limit).all()

    // Return as 'snapshots' so the frontend works without changes
    return json({ ticker: ticker.toUpperCase(), snapshots: rows.results ?? [], count: rows.results?.length ?? 0 })
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



/* ── GET /api/news/:ticker — company news (8h cache) ── */



/* ── GET /api/market-intelligence/:ticker ────────────────────────
   Single Groq call returning narrative + drivers + market-vs-model.
   Passes conviction context so Groq knows what the model thinks.
   Cache: 6h for narrative, but fetches fresh news each time.
─────────────────────────────────────────────────────────────────── */
async function handleMarketIntelligence(ticker, keys, kv) {
  const t = ticker.toUpperCase()
  const cacheKey = `market_intel:${t}`

  // Check cache (6h)
  const { value, metadata } = await kvGet(kv, cacheKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  if (!keys.groq)    return json({ error: 'Groq key not configured' }, 401)
  if (!keys.finnhub) return json({ error: 'Finnhub key not configured' }, 401)

  // 1. Fetch fresh news from Finnhub (last 7 days)
  const now  = new Date()
  const from = new Date(now - 7*24*60*60*1000).toISOString().split('T')[0]
  const to   = now.toISOString().split('T')[0]
  const newsRes = await fetch(
    `https://finnhub.io/api/v1/company-news?symbol=${t}&from=${from}&to=${to}`,
    { headers: { 'X-Finnhub-Token': keys.finnhub } }
  )
  const rawNews = newsRes.ok ? await newsRes.json() : []

  // Preprocessing: deduplicate, filter empty, sort by recency, prefer quality sources
  const seen = new Set()
  const articles = (rawNews || [])
    .filter(a => a.headline && a.headline.length > 10 && a.source)
    .filter(a => {
      const key = a.headline.toLowerCase().slice(0, 60)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
    .slice(0, 15)

  const headlines = articles.map((a,i) => `${i+1}. [${a.source}] ${a.headline}`).join('\n')

  // 2. Get conviction context from KV (for grounding)
  const fund      = await kv.get(`fund:${t}`, 'json').catch(() => null)
  const ohlcv     = await kv.get(`ohlcv:${t}:1Y`, 'json').catch(() => [])
  const spyOhlcv  = await kv.get('ohlcv:SPY:1Y', 'json').catch(() => [])
  const priceD    = await kv.get(`price:${t}`, 'json').catch(() => null)
  const score     = fund ? computeConviction(fund, ohlcv??[], spyOhlcv??[], priceD?.price??null) : null

  const scoreCtx = score ? [
    `Conviction Score: ${score.finalScore}/100 (${score.grade})`,
    `Growth: ${score.breakdown.growth.score}/25`,
    `Technical: ${score.breakdown.technical.score}/15`,
    `Valuation: ${score.breakdown.valuation.score}/15 via ${score.breakdown.valuation.metric??'N/A'}`,
    `Risk penalty: ${score.breakdown.risk.penalty}`,
  ].join(' | ') : 'No quantitative data available'

  // 3. Single Groq call — JSON output only
  const window7d = `${from} to ${to}`
  const prompt = `You are analyzing market sentiment for ${t} within a quantitative investment system.

QUANTITATIVE MODEL CONTEXT (do not modify or contradict):
${scoreCtx}

NEWS — ${window7d} (${articles.length} unique articles after deduplication):
${headlines || 'No recent news available.'}

Return ONLY valid JSON matching this exact schema (no markdown, no explanation outside JSON):
{
  "narrative": {
    "summary": "2-3 sentence description of the dominant market narrative this week",
    "sentiment": "Bullish" | "Mixed" | "Neutral" | "Bearish",
    "shift": "None" | "Positive" | "Negative"
  },
  "drivers": {
    "positive": ["up to 3 specific positive developments from the news — name companies/products by name"],
    "negative": ["up to 3 specific headwinds from the news — be specific, no generic risks"]
  },
  "marketVsModel": {
    "status": use EXACTLY one of:
      "Supports" — most material news directly reinforce the quantitative thesis,
      "Mostly Supports" — general narrative supports the thesis but 1-2 material risks exist,
      "Mixed" — positive and negative evidence is balanced or points in different directions,
      "Contradicts" — material news directly question the key drivers of the quantitative model,
    "reason": "1 sentence explaining the relationship between news narrative and quantitative thesis"
  },
  "materialHeadlines": [
    {
      "title": "headline text",
      "source": "source name",
      "impact": "positive" | "negative" | "neutral",
      "materiality": "high" | "medium" | "low",
      "url": "article url"
    }
  ]
}

Rules:
- Only use facts from the news articles provided above — never invent
- materialHeadlines: include only the 5 most relevant articles; set materiality="high" only for news that meaningfully changes the investment context
- The quantitative score is final and immutable — your role is context only
- If no relevant news, set sentiment="Neutral" and explain in summary
- Return raw JSON only`

  const gRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${keys.groq}` },
    body: JSON.stringify({
      model:'llama-3.3-70b-versatile', max_tokens:600, temperature:0.2,
      messages:[{role:'user', content:prompt}],
      response_format:{ type:'json_object' }
    }),
  })

  if (!gRes.ok) return json({ error: `Groq ${gRes.status}` }, 502)
  const gd = await gRes.json()
  const raw = gd.choices?.[0]?.message?.content ?? '{}'

  let parsed
  try { parsed = JSON.parse(raw) }
  catch { parsed = { narrative:{summary:raw,sentiment:'Neutral',shift:'None'}, drivers:{positive:[],negative:[]}, marketVsModel:{status:'Mixed',reason:'Could not parse response'} } }

  const data = {
    ticker: t,
    window:          `${from} to ${to}`,
    narrative:       parsed.narrative       ?? {},
    drivers:         parsed.drivers         ?? { positive:[], negative:[] },
    marketVsModel:   parsed.marketVsModel   ?? {},
    materialHeadlines: parsed.materialHeadlines ?? [],
    headlines:       articles.map(a=>({ headline:a.headline, source:a.source, url:a.url, datetime:a.datetime })),
    sourcesUsed:     articles.length,
    generatedAt:     Date.now(),
  }

  const meta2 = buildMeta(t, 'market_intel', TTL.MARKET_INTEL, false)
  await kvSet(kv, cacheKey, data, TTL.MARKET_INTEL, meta2)
  return json({ data, meta: meta2 })
}

/* ════════════════════════════════════════════════════════════
   CRON — WEEKLY SNAPSHOT ENGINE
   Runs every Sunday via Cloudflare Cron Trigger.
   Only processes tickers already cached in KV (from user scans).
   Zero external API calls — all data from cache.
════════════════════════════════════════════════════════════ */


async function handlePortfolioReview(request, keys, kv, db) {
  if (!keys.groq) return json({ error: 'Groq key not configured' }, 401)
  const body = await request.json().catch(() => null)
  if (!body?.positions?.length) return json({ error: 'positions required' }, 400)
  const { positions, modelVersion = 'conviction-v1.0' } = body

  // Cache key: portfolio hash + ISO week + model version
  const stateStr = positions.map(p => `${p.ticker}:${p.conviction?.score}:${p.conviction?.grade}`).sort().join(',')
  const hashVal  = [...stateStr].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
  const d = new Date(); const thu = new Date(d); thu.setDate(d.getDate() - ((d.getDay()+6)%7) + 3)
  const yr = thu.getFullYear(); const ft = new Date(yr,0,4)
  const week = `${yr}-W${String(1+Math.round(((thu-ft)/86400000-3+((ft.getDay()+6)%7))/7)).padStart(2,'0')}`
  const cacheKey = `portfolio-review:${week}:${modelVersion}:${Math.abs(hashVal)}`
  const { value: cached } = await kvGet(kv, cacheKey)
  if (cached) return json({ data: cached, meta: { fromCache: true, cacheKey } })

  // Fetch last D1 snapshot per ticker for historical delta
  const histMap = {}
  if (db) {
    try {
      const tickers = positions.map(p => p.ticker)
      const ph = tickers.map(() => '?').join(',')
      const rows = await db.prepare(
        `SELECT ticker, score, grade, snapshot_date FROM snapshots
         WHERE ticker IN (${ph}) AND grade != 'BENCHMARK'
         ORDER BY snapshot_date DESC`
      ).bind(...tickers).all()
      for (const row of (rows.results ?? [])) {
        if (!histMap[row.ticker]) histMap[row.ticker] = row
      }
    } catch(e) { console.error('[PortfolioReview] D1:', e.message) }
  }

  // Deterministic portfolio metrics
  const gradeCounts = {'STRONG BUY':0,'BUY':0,'HOLD':0,'SELL':0,'STRONG SELL':0}
  for (const p of positions) { const g = p.conviction?.grade; if (g && gradeCounts[g]!==undefined) gradeCounts[g]++ }

  const sectorPct = {}
  for (const p of positions) { const s = p.sector||'Other'; sectorPct[s] = (sectorPct[s]||0)+(p.weight||0) }
  const topSector = Object.entries(sectorPct).sort((a,b)=>b[1]-a[1])[0]

  const top3 = [...positions].sort((a,b)=>(b.weight||0)-(a.weight||0)).slice(0,3)
  const top3Pct = top3.reduce((s,p)=>s+(p.weight||0), 0)

  // Concentration thresholds — change here only (same versioning as Compare Stocks)
  const SECTOR_CONC_MODERATE = 35  // % above which concentration is Moderate
  const SECTOR_CONC_HIGH     = 50  // % above which concentration is High
  const concLevel = (topSector?.[1] ?? 0) > SECTOR_CONC_HIGH     ? 'High'
                  : (topSector?.[1] ?? 0) > SECTOR_CONC_MODERATE  ? 'Moderate' : 'Low'
  const concRule  = (topSector?.[1] ?? 0) > SECTOR_CONC_HIGH     ? `sector > ${SECTOR_CONC_HIGH}%`
                  : (topSector?.[1] ?? 0) > SECTOR_CONC_MODERATE  ? `sector > ${SECTOR_CONC_MODERATE}%`
                  : `sector ≤ ${SECTOR_CONC_MODERATE}%`

  const gatePositions = positions.filter(p => p.conviction?.gate && p.conviction.gate !== 'none' && p.conviction.gate !== 'None')

  // Near-downgrade: use effective grade (post-gate), distance to next grade threshold
  // If Gate is active, effective grade is already capped — use that grade's threshold
  const GRADE_THRESHOLDS = {'STRONG BUY':85,'BUY':70,'HOLD':55,'SELL':40,'STRONG SELL':0}
  const nearDowngrade = positions.filter(p => {
    const s=p.conviction?.score, g=p.conviction?.grade
    if (!s||!g) return false
    // Gate is reflected in the effective grade already — use it directly
    const t=GRADE_THRESHOLDS[g]
    return t>0 && (s-t)<=5  // within 5 pts of dropping to next grade
  }).map(p => ({
    ticker: p.ticker,
    score:  p.conviction?.score,
    grade:  p.conviction?.grade,
    gate:   p.conviction?.gate||'none',
    distanceToDowngrade: p.conviction?.score - GRADE_THRESHOLDS[p.conviction?.grade]
  }))

  const now = Date.now()
  const upcomingEarnings = positions
    .filter(p=>p.nextEarnings)
    .map(p=>({ticker:p.ticker,date:p.nextEarnings,weight:p.weight||0,
      daysAway:Math.round((new Date(p.nextEarnings)-now)/86400000)}))
    .filter(e=>e.daysAway>=0&&e.daysAway<=21)
    .sort((a,b)=>a.daysAway-b.daysAway)

  const deltas = positions
    .filter(p=>histMap[p.ticker])
    .map(p=>{
      const h=histMap[p.ticker], cs=p.conviction?.score||0, ps=h.score||0
      return {ticker:p.ticker,scoreDelta:cs-ps,prevGrade:h.grade,currGrade:p.conviction?.grade,
        gradeChanged:h.grade!==p.conviction?.grade,snapshotDate:h.snapshot_date}
    })
    .filter(d=>d.scoreDelta!==0||d.gradeChanged)
    .sort((a,b)=>Math.abs(b.scoreDelta)-Math.abs(a.scoreDelta))

  // Build Groq prompt with pre-computed context
  const posSummary = positions.map(p => {
    const h=histMap[p.ticker]
    const delta=h?` (prev ${h.score}/${h.grade} on ${h.snapshot_date})`:'  '
    return `${p.ticker} ${(p.weight||0).toFixed(1)}% | LT:${p.conviction?.score||'?'} ${p.conviction?.grade||'?'} | Swing:${p.swing?.score||'?'} ${p.swing?.grade||'?'} | Gate:${p.conviction?.gate||'none'}${delta}`
  }).join('\n')

  // Sector breakdown — all sectors with %, not just top one
  const allSectors = Object.entries(sectorPct).sort((a,b)=>b[1]-a[1])
    .map(([s,p])=>`${s} ${p.toFixed(1)}%`).join(', ')

  // Downgrade severity — dropping from STRONG BUY→BUY is Low; HOLD→SELL is High
  const NEXT_GRADE = {'STRONG BUY':'BUY','BUY':'HOLD','HOLD':'SELL','SELL':'STRONG SELL'}
  const GRADE_SEVERITY = {'STRONG BUY→BUY':'Low','BUY→HOLD':'Medium','HOLD→SELL':'High','SELL→STRONG SELL':'High'}
  const nearDowngradeRich = nearDowngrade.map(d => {
    const next = NEXT_GRADE[d.grade] ?? 'lower'
    const sev  = GRADE_SEVERITY[`${d.grade}→${next}`] ?? 'Medium'
    const gt   = d.gate !== 'none' ? ` gate:${d.gate}` : ''
    return `${d.ticker}(${d.score} ${d.grade} →${next} in ${d.distanceToDowngrade}pts severity:${sev}${gt})`
  })

  // Gate details
  const gateDetails = {}
  for (const p of gatePositions) {
    const cv = p.conviction ?? {}
    const gf = cv.gateFundamentals ?? {}  // actual ROIC, operatingMargin values
    const gc = cv.gateChecks ?? {}
    if (cv.gate === 'gate2') {
      // Gate2: ROIC/ROE >= 8% AND operating margin > 0%
      // Use actual fundamentals values when available, fall back to check pass/fail
      const roicVal    = gf.roic != null ? parseFloat(gf.roic) : null
      const marginVal  = gf.operatingMargin != null ? parseFloat(gf.operatingMargin) : null
      const roicCheck  = gc.gate2roic
      const mrgCheck   = gc.gate2operatingMargin
      const failedRoic   = roicVal != null ? roicVal < 8  : (roicCheck  && !roicCheck.pass)
      const failedMargin = marginVal != null ? marginVal <= 0 : (mrgCheck && !mrgCheck.pass)
      const roicStr    = roicVal != null ? `${roicVal.toFixed(1)}%` : (roicCheck?.value != null ? `${roicCheck.value.toFixed(1)}%` : null)
      const marginStr  = marginVal != null ? `${marginVal.toFixed(1)}%` : (mrgCheck?.value != null ? `${mrgCheck.value.toFixed(1)}%` : null)
      const parts = []
      if (failedRoic)   parts.push(`Best of ROIC/ROE: ${roicStr ?? 'unavailable'} (minimum 8% — at least one must qualify)`)
      if (failedMargin) parts.push(`Operating margin: ${marginStr ?? 'unavailable'} (must be positive)`)
      const cause = parts.length ? parts.join(' and ') + ' failed' : 'Quality threshold not met'
      gateDetails[p.ticker] = { gate: 'Gate2', cap: 58, failedRoic, failedMargin, label: cause }
    } else if (cv.gate === 'gate1') {
      const revVal = gf.revenueGrowth, revCheck = gc.gate1revenue
      const failedRev = revCheck && !revCheck.pass
      const causes = failedRev ? [`revenue growth ${revVal != null ? revVal.toFixed(1)+'%' : 'negative'}`] : ['financial condition']
      gateDetails[p.ticker] = { gate: 'Gate1', cap: 35, label: `${causes.join(' and ')} failed` }
    }
  }

  const gateRich = gatePositions.map(p => {
    const ticker = p.ticker
    const det    = gateDetails[ticker]
    const cv     = p.conviction ?? {}
    const gType  = cv.gate === 'gate2' ? 'Gate2(capped-at-58)' : cv.gate === 'gate1' ? 'Gate1(capped-at-35)' : cv.gate
    const reason = det ? `${det.label} · score capped at ${det.cap}` : 'Gate active'
    return `${ticker}(${cv.score} ${cv.grade} ${gType} reason:"${reason}")`
  })

  // Portfolio status factors
  const sellPositions = positions.filter(p=>['SELL','STRONG SELL'].includes(p.conviction?.grade))
  const sellCount    = sellPositions.length
  const sellWeight   = sellPositions.reduce((s,p)=>s+(p.weight||0),0)
  const nearDowngradeSeverity = {}
  nearDowngrade.forEach(d => {
    const next = NEXT_GRADE[d.grade] ?? 'lower'
    nearDowngradeSeverity[d.ticker] = GRADE_SEVERITY[`${d.grade}→${next}`] ?? 'Medium'
  })
  const highSevTickers = nearDowngrade.filter(d => nearDowngradeSeverity[d.ticker] === 'High').map(d=>d.ticker)
  const medSevTickers  = nearDowngrade.filter(d => nearDowngradeSeverity[d.ticker] === 'Medium').map(d=>d.ticker)
  const lowSevTickers  = nearDowngrade.filter(d => nearDowngradeSeverity[d.ticker] === 'Low').map(d=>d.ticker)
  const highSevCount   = highSevTickers.length
  // Deterministic posture facts — Groq must quote these, not recalculate
  // Gate causes per ticker — do NOT merge into one combined statement
  const gateSentences = gatePositions.map(p => {
    const cv = p.conviction ?? {}
    if (cv.gate === 'gate2') {
      const q = cv.components?.quality ?? 0, s = cv.components?.strength ?? 0
      return `${p.ticker}: Gate2 active — Quality ${q}/20 and Strength ${s}/15 below minimums, capped at 58`
    }
    return `${p.ticker}: Gate1 active — financial condition failed, capped at 35`
  })
  const postureFactsSentence = [
    sellCount > 0 ? `${sellCount} position${sellCount>1?'s':''} rated SELL or STRONG SELL (${sellWeight.toFixed(1)}% of portfolio weight)` : null,
    gateSentences.length > 0 ? gateSentences.join('; ') : null,
    highSevCount > 0 ? `${highSevCount} position${highSevCount>1?'s':''} close to SELL threshold (${highSevTickers.join(', ')})` : null,
  ].filter(Boolean).join('. ')

  const metricsText = `GRADE DISTRIBUTION: ${Object.entries(gradeCounts).filter(([,v])=>v>0).map(([k,v])=>`${v} ${k}`).join(', ')}

SECTOR CONCENTRATION (use THESE exact labels — do not invent new ones):
${allSectors}
Top sector: ${topSector?.[0] ?? 'n/a'} at ${topSector?.[1]?.toFixed(1) ?? 0}% → deterministic label: ${concLevel} (>50%=High, >35%=Moderate, ≤35%=Low)

ACTIVE GATES (always name the Gate type — it is not a black box):
${gateRich.length>0?gateRich.join(', '):'none'}

NEAR DOWNGRADE (severity already computed — use it):
${nearDowngradeRich.length>0?nearDowngradeRich.join(', '):'none'}
Note: Low severity (STRONG BUY→BUY) is informational only — do NOT put in Watch Zone.
Group near-downgrades by severity in footer: High=[list], Medium=[list], Low=[list]

TOP 3 BY WEIGHT: ${top3.map(p=>`${p.ticker} ${(p.weight||0).toFixed(1)}%`).join(', ')} = ${top3Pct.toFixed(1)}% combined

PORTFOLIO STATUS FACTORS (cite these when justifying Cautious/Neutral/Defensive):
VERIFIED POSTURE FACTS (quote these exactly — do not recalculate):
${postureFactsSentence}

SELL/STRONG SELL breakdown: ${sellCount} positions totaling ${sellWeight.toFixed(1)}% weight
Active gates: ${gatePositions.length}
Near-grade-boundary by severity:
  High: ${highSevTickers.length>0?highSevTickers.join(', '):'none'}
  Medium: ${medSevTickers.length>0?medSevTickers.join(', '):'none'}
  Low (informational only): ${lowSevTickers.length>0?lowSevTickers.join(', '):'none'}

UPCOMING EARNINGS (next 21d): ${upcomingEarnings.length>0?upcomingEarnings.map(e=>`${e.ticker} in ${e.daysAway}d (${e.weight.toFixed(1)}%)`).join(', '):'none'}
SCORE CHANGES VS SNAPSHOT: ${deltas.length>0?deltas.map(d=>`${d.ticker} ${d.scoreDelta>0?'+':''}${d.scoreDelta}${d.gradeChanged?' GRADE CHANGE':''}`).join(', '):'none'}`

  // Fetch macro context — Worker computes regime, Groq only narrates
  let macroText = 'MACRO CONTEXT: Not available (FRED_KEY not configured).'
  let macroResult = null
  try {
    macroResult = await handleMacroContext(kv, keys.fred)
    const mc = macroResult?.data
    if (mc) {
      const { series: s, computed: c } = mc
      macroText = `MACRO CONTEXT (FRED, ${new Date(mc.fetchedAt).toISOString().split('T')[0]}):
Fed Funds Rate: ${s.effr?.value ?? 'N/A'}% (${s.effr?.date ?? '?'})
2Y Treasury: ${s.dgs2?.value ?? 'N/A'}% | 10Y Treasury: ${s.dgs10?.value ?? 'N/A'}%
Yield Curve (10Y-2Y): ${s.spread?.value != null ? (s.spread.value > 0 ? '+' : '') + s.spread.value + '%' : 'N/A'} [${c.curveRegime}]
Core CPI YoY: ${c.coreInflYoY != null ? c.coreInflYoY + '%' : 'N/A'} [${c.inflRegime}]
Rate Regime: ${c.rateRegime} | Overall: ${c.overallRegime}
Note: These are pre-computed regimes. Do NOT recalculate or contradict them.`
    }
  } catch(e) { console.error('[PortfolioReview] macro fetch:', e.message) }

  const prompt = `You are reviewing a quantitative investment portfolio. All metrics below were computed deterministically — do not recalculate them.

POSITIONS (${positions.length}):
${posSummary}

${macroText}

PRE-COMPUTED METRICS:
${metricsText}

Return ONLY valid JSON:
{
  "portfolioSummary": { "status": "Constructive|Neutral|Cautious|Defensive", "text": "2-3 sentences" },
  "concentration": { "level": "Low|Moderate|High", "primaryRisk": "one line" },
  "spotlight": [{ "ticker": "...", "reason": "one sentence", "severity": "low|medium|high" }],
  "watchZone": [{ "ticker": "...", "reason": "one sentence", "trigger": "what to watch" }],
  "weeklyPriority": { "ticker": "...", "action": "Review|Monitor|Consider reducing|etc", "reason": "one sentence" },
  "dataCoverage": { "positionsAnalyzed": ${positions.length}, "historicalComparisonsAvailable": ${Object.keys(histMap).length} }
}
Rules:
- SECTOR: use the exact label from SECTOR CONCENTRATION (Low/Moderate/High). Never write "high concentration of X" if label is Moderate.
- SEVERITY: Low (STRONG BUY→BUY) is informational. Only Medium/High severities belong in Watch Zone.
- TRIGGERS: cite actual score thresholds (e.g. "LT score falls below 55"), never tautological phrases like "a decline in its rating".
- GATES: name the Gate type (Gate1/Gate2) and its cap rule in the reason field.
- DIVERSITY: Spotlight and Watch Zone must not repeat the same ticker. Spotlight = most material. Watch Zone = additional positions not in Spotlight.
- PORTFOLIO STATUS: cite the exact numbers from PORTFOLIO STATUS FACTORS when explaining the posture choice.
- LANGUAGE: avoid dramatic phrases like "significant decline in its rating". Instead use: "crosses from HOLD to SELL threshold" or "LT score falls below 55".
- WEIGHT: use the weightMateriality field (high/moderate/low) from each position. Never describe a 'low' weight position as "significant".
- CONCLUSION: end narratives with a specific risk summary, not generic phrases like "careful monitoring". Name the actual risks.
- GATES: explain the specific condition that triggered each gate (use cause: from the payload), not just the gate name.
- spotlight max 3. weeklyPriority is not a trade order. Use only provided data. Raw JSON only.`

  const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:'POST',
    headers:{'Authorization':`Bearer ${keys.groq}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:'llama-3.3-70b-versatile',
      messages:[{role:'user',content:prompt}],
      temperature:0.2,max_tokens:800,response_format:{type:'json_object'}})
  })
  if (!gr.ok) {
    const errBody = await gr.text().catch(() => gr.status)
    console.error('[PortfolioReview] Groq HTTP error:', gr.status, errBody.slice(0,200))
    // Fall through to deterministic fallback
  }
  const gd = gr.ok ? await gr.json().catch(() => ({})) : {}
  let parsed = {}
  const rawContent = gd.choices?.[0]?.message?.content ?? '{}'
  try {
    parsed = JSON.parse(rawContent)
  } catch {
    // Groq returned invalid JSON — use deterministic fallback
    parsed = {
      _fallback: true,  // signals UI to show "deterministic summary" label
      portfolioSummary: {
        status: 'Neutral',
        text: 'AI narrative temporarily unavailable — showing deterministic portfolio metrics.'
      },
      concentration: { level: concLevel, primaryRisk: topSector ? `${topSector[0]} at ${topSector[1].toFixed(1)}%` : 'n/a' },
      spotlight: nearDowngrade.slice(0,2).map(d => ({
        ticker: d.ticker, reason: `Within ${d.distanceToDowngrade} pts of downgrade threshold.`, severity: d.distanceToDowngrade <= 2 ? 'high' : 'medium'
      })),
      watchZone: gatePositions.slice(0,2).map(p => ({
        ticker: p.ticker, reason: `Active gate: ${p.conviction?.gate}`, trigger: 'Monitor for gate deactivation'
      })),
      weeklyPriority: { ticker: null, action: 'Review deterministic metrics', reason: 'AI summary unavailable this week.' }
    }
  }

  // ── Post-validation: enforce rules regardless of what Groq decided ──────────
  // The prompt guides; the Worker guarantees.
  const validTickers = new Set(positions.map(p => p.ticker))
  const allowedSeverities = new Set(['low', 'medium', 'high'])

  // 1. Spotlight: max 3, valid tickers only, deterministic order
  const SEV_RANK = { high: 3, medium: 2, low: 1 }
  const spotlightByTicker = {}
  positions.forEach(p => { spotlightByTicker[p.ticker] = p })
  if (Array.isArray(parsed.spotlight)) {
    parsed.spotlight = parsed.spotlight
      .filter(s => s?.ticker && validTickers.has(s.ticker))
      .map(s => ({ ...s, severity: allowedSeverities.has(s.severity?.toLowerCase()) ? s.severity.toLowerCase() : 'medium' }))
      .sort((a, b) => {
        const sevDiff = (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0)
        if (sevDiff !== 0) return sevDiff
        const gateA = gateDetails[a.ticker] ? 1 : 0, gateB = gateDetails[b.ticker] ? 1 : 0
        if (gateB !== gateA) return gateB - gateA
        const wA = spotlightByTicker[a.ticker]?.weight ?? 0, wB = spotlightByTicker[b.ticker]?.weight ?? 0
        return wB - wA
      })
      .slice(0, 3)
  }

  // 2. Watch Zone: must NOT repeat Spotlight tickers, max 5, valid tickers only
  const spotlightTickers = new Set((parsed.spotlight ?? []).map(s => s.ticker))
  if (Array.isArray(parsed.watchZone)) {
    parsed.watchZone = parsed.watchZone
      .filter(w => w?.ticker && validTickers.has(w.ticker) && !spotlightTickers.has(w.ticker))
      .slice(0, 5)
  }

  // 3. Weekly Priority: must be a valid ticker or null
  if (parsed.weeklyPriority?.ticker && !validTickers.has(parsed.weeklyPriority.ticker)) {
    parsed.weeklyPriority.ticker = null
  }

  // 4. Portfolio Summary: status must be one of the allowed values
  const allowedStatus = new Set(['Constructive', 'Neutral', 'Cautious', 'Defensive'])
  if (parsed.portfolioSummary && !allowedStatus.has(parsed.portfolioSummary.status)) {
    parsed.portfolioSummary.status = 'Neutral'
  }

  // Fix 2: Post-validator excludes Low severity from Watch Zone by code (not by prompt)
  if (Array.isArray(parsed.watchZone)) {
    parsed.watchZone = parsed.watchZone.filter(item => {
      if (!item?.ticker) return false
      return nearDowngradeSeverity[item.ticker] !== 'Low'
    })
  }

  // Build gate details map for UI to display deterministically


  const data = { ...parsed,
    macro: macroResult?.data ?? null,
    nearDowngradeGroups: { high: highSevTickers, medium: medSevTickers, low: lowSevTickers },
    gateDetails,
    postureFactsSentence,
    metrics:{ gradeCounts, gatePositions:gatePositions.map(p=>p.ticker),
      nearDowngrade, topSector, concLevel, concRule, top3Pct,
      upcomingEarnings, deltas },
    generatedAt:Date.now(), week, modelVersion,
    _meta: {
      prompt_version: 'pr-v2.9',
      llm_model:      'llama-3.1-70b-versatile',
      fallback_used:  !!parsed._fallback,
    },
  }

  const meta2 = buildMeta('portfolio','portfolio-review',604800,false)
  await kvSet(kv, cacheKey, data, 604800, meta2)
  return json({ data, meta:meta2 })
}

/* ── Daily RS Calculation (Mon-Fri 21:00 UTC) ────────────────────────
   Runs AFTER market close. Processes all active constituents in batches.
   - Fetches Alpaca multi-symbol bars (50 at a time)
   - Computes RS vs SPY
   - Upserts market_rs_daily (idempotent on analysis_date + symbol)
   - Aggregates industry_trend_daily
   - Invalidates market-map KV cache only after completion
   - Uses "partial" status if some batches fail; UI shows last complete snapshot
──────────────────────────────────────────────────────────────────────── */
async function handleDailyRS(env) {
  const db  = env.TRADEPOINT_DB
  const kv  = env.TRADEPOINT_KV
  if (!db || !env.ALPACA_KEY || !env.ALPACA_SECRET) {
    console.log('[DailyRS] Missing D1 or Alpaca credentials — skipping')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  console.log(`[DailyRS] Starting for ${today}`)

  const alpacaHdr = { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET }
  const BATCH_SIZE = 50

  // Get SPY baseline first
  const spyData = await fetchJSON(
    `https://data.alpaca.markets/v2/stocks/bars/SPY?timeframe=1Day&limit=260&feed=iex`,
    { headers: alpacaHdr }
  ).catch(e => { console.error('[DailyRS] SPY fetch failed:', e.message); return null })

  const spyBarsRaw2 = spyData?.bars
  const spyBarsArr2 = Array.isArray(spyBarsRaw2) ? spyBarsRaw2 : (spyBarsRaw2?.SPY ?? [])
  const spyClose = spyBarsArr2.map(b => b.c)
  if (spyClose.length < 22) {
    console.log('[DailyRS] Insufficient SPY data — skipping')
    return
  }
  const spyRet = (n) => {
    if (spyClose.length < n+1) return null
    const prev = spyClose[spyClose.length-1-n]
    return prev > 0 ? ((spyClose[spyClose.length-1] - prev) / prev) * 100 : null
  }
  const spyRs1m = spyRet(21), spyRs3m = spyRet(63), spyRs6m = spyRet(126)

  // Get all active constituents
  const members = await db.prepare(
    `SELECT symbol, company_id, industry, sector FROM constituent_master WHERE active_to IS NULL ORDER BY symbol`
  ).all().then(r => r.results ?? []).catch(() => [])

  if (!members.length) { console.log('[DailyRS] No constituents in master — skipping'); return }

  let totalProcessed = 0, totalInsufficient = 0, batchErrors = 0
  const symbols = members.map(m => m.symbol)
  const memberMap = Object.fromEntries(members.map(m => [m.symbol, m]))

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    const barsData = await fetchJSON(
      `https://data.alpaca.markets/v2/stocks/bars?symbols=${batch.join(',')}&timeframe=1Day&limit=260&feed=iex`,
      { headers: alpacaHdr }
    ).catch(e => { console.error(`[DailyRS] Batch ${i} fetch error:`, e.message); batchErrors++; return null })

    if (!barsData) continue

    for (const symbol of batch) {
      const bars   = barsData?.bars?.[symbol] ?? []
      const closes = bars.map(b => b.c)
      const m      = memberMap[symbol]

      if (closes.length < 22) {
        totalInsufficient++
        await db.prepare(`
          INSERT INTO market_rs_daily (analysis_date, symbol, company_id, industry, sector, data_quality)
          VALUES (?, ?, ?, ?, ?, 'insufficient_history')
          ON CONFLICT(analysis_date, symbol) DO UPDATE SET data_quality='insufficient_history'
        `).bind(today, symbol, m.company_id, m.industry, m.sector).run().catch(() => {})
        continue
      }

      const ret = (n) => {
        if (closes.length < n+1) return null
        const prev = closes[closes.length-1-n]
        return prev > 0 ? ((closes[closes.length-1] - prev) / prev) * 100 : null
      }
      const rs1m = spyRs1m != null ? (ret(21) ?? 0) - spyRs1m : null
      const rs3m = spyRs3m != null ? (ret(63) ?? 0) - spyRs3m : null
      const rs6m = spyRs6m != null ? (ret(126) ?? 0) - spyRs6m : null
      const trend = rs1m != null && rs3m != null && rs6m != null
        ? rs1m * 0.40 + rs3m * 0.35 + rs6m * 0.25 : null

      await db.prepare(`
        INSERT INTO market_rs_daily
          (analysis_date, symbol, company_id, industry, sector, rs_1m, rs_3m, rs_6m, trend_score, data_quality)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok')
        ON CONFLICT(analysis_date, symbol) DO UPDATE SET
          rs_1m=excluded.rs_1m, rs_3m=excluded.rs_3m, rs_6m=excluded.rs_6m,
          trend_score=excluded.trend_score, data_quality='ok'
      `).bind(today, symbol, m.company_id, m.industry, m.sector, rs1m, rs3m, rs6m, trend).run().catch(() => {})
      totalProcessed++
    }
  }

  // Coverage-based snapshot states
  const totalAttempted   = totalProcessed + totalInsufficient
  const coveragePct      = symbols.length > 0
    ? Math.round((totalProcessed / symbols.length) * 100) : 0
  const snapshotStatus   = coveragePct >= 95 ? 'complete'
                         : coveragePct >= 85 ? 'partial'
                         : 'failed'

  console.log(`[DailyRS] coverage=${coveragePct}% (${totalProcessed}/${symbols.length}) status=${snapshotStatus}`)

  if (snapshotStatus === 'complete') {
    // Full snapshot: aggregate industries + invalidate KV cache for UI
    await aggregateIndustries(db, today)
    await kv.delete('market-map:latest:v2').catch(() => {})
    console.log(`[DailyRS] Complete snapshot published for ${today}`)
  } else if (snapshotStatus === 'partial') {
    // Partial: save to market_rs_daily for diagnostics but DON'T invalidate KV
    // UI will keep showing last complete snapshot
    await aggregateIndustries(db, today)  // save partial aggregation for debugging
    console.log(`[DailyRS] Partial snapshot saved for ${today} — UI keeps last complete`)
  } else {
    // Failed: don't touch anything — UI keeps last complete snapshot
    console.log(`[DailyRS] Failed snapshot for ${today} (${coveragePct}%) — no changes published`)
  }

  // Record run status in dedicated table (never in industry_trend_daily)
  await db.prepare(`
    INSERT INTO market_map_runs
      (analysis_date, status, symbols_expected, symbols_processed, symbols_insufficient,
       coverage_pct, batches_total, batches_failed, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(analysis_date) DO UPDATE SET
      status=excluded.status, symbols_processed=excluded.symbols_processed,
      coverage_pct=excluded.coverage_pct, batches_failed=excluded.batches_failed,
      completed_at=excluded.completed_at
  `).bind(
    today, snapshotStatus, symbols.length, totalProcessed, totalInsufficient,
    coveragePct, Math.ceil(symbols.length / BATCH_SIZE), batchErrors,
    new Date().toISOString(), new Date().toISOString()
  ).run().catch(e => console.error('[DailyRS] Failed to write run status:', e.message))
}

async function handleWeeklySnapshot(env) {
  const kv = env.TRADEPOINT_KV
  const db = env.TRADEPOINT_DB
  if (!db) { console.error('[Cron] D1 not configured'); return }

  const today = etDate()   // Eastern Time
  console.log(`[Cron] Starting weekly snapshot — ${today} ET`)

  // ── Compute market regime from SPY EMA200 ───────────────────────────
  let currentRegime = 'unknown'
  try {
    const spyOhlcvRaw = await kv.get('ohlcv:SPY:1Y', 'json') ?? []
    const spyPriceD   = await kv.get('price:SPY', 'json')
    const spyPrice    = spyPriceD?.price ?? (spyOhlcvRaw.length ? spyOhlcvRaw[spyOhlcvRaw.length-1].price : null)

    // Compute SPY EMA200 deterministically
    if (spyOhlcvRaw.length >= 20) {
      const closes = spyOhlcvRaw.map(b => b.price ?? b.close ?? b.c).filter(Boolean)
      const period = Math.min(200, closes.length)
      const k = 2 / (period + 1)
      let ema = closes.slice(0, period).reduce((a,b) => a+b, 0) / period
      for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k)
      const spyAboveEMA = spyPrice && spyPrice > ema
      // Also check short-term slope (EMA50 vs EMA200)
      const period50 = Math.min(50, closes.length)
      const k50 = 2 / (period50 + 1)
      let ema50 = closes.slice(0, period50).reduce((a,b) => a+b, 0) / period50
      for (let i = period50; i < closes.length; i++) ema50 = closes[i] * k50 + ema50 * (1 - k50)
      if (spyAboveEMA && ema50 > ema) currentRegime = 'bullish'
      else if (!spyAboveEMA) currentRegime = 'bearish'
      else currentRegime = 'neutral'
    }

    if (spyPrice) {
      await db.prepare(`
        INSERT OR REPLACE INTO snapshots (
          ticker, snapshot_date, price, score, grade,
          growth_score, quality_score, strength_score, valuation_score, technical_score,
          market_regime, model_version
        ) VALUES ('SPY', ?, ?, null, 'BENCHMARK', null, null, null, null, null, ?, 'benchmark')
      `).bind(today, spyPrice, currentRegime).run()
      console.log(`[Cron] SPY benchmark saved — price: $${spyPrice} regime: ${currentRegime}`)
    }
  } catch (err) {
    console.error('[Cron] SPY benchmark error:', err.message)
    currentRegime = 'unknown'
  }

  // List all tickers with cached fundamentals (90d TTL)
  const listed = await kv.list({ prefix: 'fund:' })
  const tickers = listed.keys.map(k => k.name.replace('fund:', '')).filter(t => t !== 'SPY')
  if (!tickers.length) { console.log('[Cron] No cached fundamentals found'); return }

  // Fetch SPY OHLCV once — shared baseline for RS calculation
  const spyRaw = await kv.get('ohlcv:SPY:1Y', 'json')
  const spyOhlcv = spyRaw ?? []

  let saved = 0, skipped = 0, errors = 0

  // Process in batches of 10 (all from cache, very fast)
  for (let i = 0; i < tickers.length; i += 10) {
    const batch = tickers.slice(i, i + 10)

    await Promise.all(batch.map(async ticker => {
      try {
        // Get fundamentals from KV (instant — always available if in list)
        const fund = await kv.get(`fund:${ticker}`, 'json')
        if (!fund) { skipped++; return }

        // Get OHLCV from KV (may be expired — that's OK, technical gets null)
        const ohlcv = await kv.get(`ohlcv:${ticker}:1Y`, 'json') ?? []

        // Get current price from KV (5min TTL — may be stale)
        const priceData = await kv.get(`price:${ticker}`, 'json')
        const price = priceData?.price ?? null

        // Compute conviction score
        const result = computeConviction(fund, ohlcv, spyOhlcv, price)

        // Save to D1 snapshots (UNIQUE constraint prevents duplicate per week)
        await db.prepare(`
          INSERT OR REPLACE INTO snapshots (
            ticker, snapshot_date, price, score, grade, confidence,
            raw_score, risk_penalty, active_gate,
            growth_score, quality_score, strength_score, valuation_score, technical_score,
            rsi, ema200, above_ema200, rs_weighted,
            upside_pct, analysts, sector_profile, model_version, breakdown_json,
            market_regime
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          ticker, today, price, result.finalScore, result.grade, result.confidence,
          result.rawScore, result.riskPenalty, result.activeGate,
          result.breakdown.growth.score, result.breakdown.quality.score,
          result.breakdown.strength.score, result.breakdown.valuation.score,
          result.breakdown.technical.score,
          result.technical.rsi, result.technical.ema200,
          result.technical.aboveEMA200 ? 1 : 0, result.technical.relStrengthWeighted,
          result.wallStreet.upside, result.wallStreet.analysts,
          result.sectorProfile, result.modelVersion,
          JSON.stringify(result.breakdown),
          currentRegime
        ).run()

        saved++
      } catch (err) {
        console.error('[Cron]', ticker, err.message)
        errors++
      }
    }))
  }

  console.log(`[Cron] Done — saved: ${saved}, skipped: ${skipped}, errors: ${errors}`)
}

/* ── GET /api/snapshots/:ticker — score history from D1 ── */
async function handleGetSnapshots(ticker, db, limit=52) {
  if (!db) return json({ error: 'D1 not configured' }, 503)
  try {
    const rows = await db.prepare(
      'SELECT snapshot_date, score, grade, confidence, growth_score, quality_score, strength_score, valuation_score, technical_score, active_gate, price, upside_pct, rsi, rs_weighted, model_version FROM snapshots WHERE ticker=? ORDER BY snapshot_date DESC LIMIT ?'
    ).bind(ticker.toUpperCase(), limit).all()
    return json({ ticker: ticker.toUpperCase(), snapshots: rows.results ?? [], count: rows.results?.length ?? 0 })
  } catch (err) { return json({ error: err.message }, 500) }
}

/* ── GET /api/snapshots — aggregate snapshot stats ── */
async function handleSnapshotStats(db) {
  if (!db) return json({ error: 'D1 not configured' }, 503)
  try {
    const stats = await db.prepare(`
      SELECT COUNT(*) AS total, COUNT(DISTINCT ticker) AS tickers,
        COUNT(DISTINCT snapshot_date) AS weeks,
        AVG(score) AS avg_score, MIN(snapshot_date) AS earliest, MAX(snapshot_date) AS latest,
        SUM(CASE WHEN grade='STRONG BUY' THEN 1 ELSE 0 END) AS strong_buy,
        SUM(CASE WHEN grade='BUY'        THEN 1 ELSE 0 END) AS buy,
        SUM(CASE WHEN grade='HOLD'       THEN 1 ELSE 0 END) AS hold,
        SUM(CASE WHEN grade='SELL'       THEN 1 ELSE 0 END) AS sell,
        SUM(CASE WHEN grade='STRONG SELL'THEN 1 ELSE 0 END) AS strong_sell
      FROM snapshots
    `).first()
    return json({ stats })
  } catch (err) { return json({ error: err.message }, 500) }
}


/* ── GET /api/groq-debug/:ticker/:type — returns raw Groq response ── */
async function handleGroqDebug(ticker, type, keys, kv) {
  const t = ticker.toUpperCase()
  if (!keys.groq) return json({ error: 'No Groq key' }, 401)
  const fund = await kv.get(`fund:${t}`, 'json').catch(() => null)
  const ohlcv = await kv.get(`ohlcv:${t}:1Y`, 'json').catch(() => [])
  const spyOhlcv = await kv.get('ohlcv:SPY:1Y', 'json').catch(() => [])
  const priceD = await kv.get(`price:${t}`, 'json').catch(() => null)
  const score = fund ? computeConviction(fund, ohlcv ?? [], spyOhlcv ?? [], priceD?.price ?? null) : null
  const prompt = buildPrompt(type || 'moat', t, fund, score)
  if (!prompt) return json({ error: 'No prompt' }, 400)

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.groq}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 600, temperature: 0.3,
      messages: [{ role: 'user', content: prompt }] }),
  })
  const gd = await res.json()
  const rawText = gd.choices?.[0]?.message?.content || ''
  return json({
    ticker: t, type: type || 'moat',
    promptLength: prompt.length,
    rawText,
    rawLength: rawText.length,
    groqStatus: res.status,
    groqError: gd.error ?? null,
  })
}


/* ════════════════════════════════════════════════════════════
   MODULE: INSIDER ACTIVITY — SEC EDGAR Form 4 parser
   Data flow:
     1. KV cache (6h TTL) — instant return if hit
     2. D1  — permanent store, check for already-parsed filings
     3. SEC EDGAR submissions JSON → filter Form 4 filings last 90d
     4. Fetch + parse XML for new filings only (rate-limit: 120ms gap)
     5. INSERT OR IGNORE → D1 | refresh KV summary
════════════════════════════════════════════════════════════ */

/* ── XML helpers (no DOM in Workers) ─────────────────────── */
/* Simple string-based XML field extractor — avoids regex escape issues in Workers */
function xmlVal(xml, tag) {
  // Try <tag>...<value>X</value>... pattern first (nested Form 4 structure)
  const openTag = '<' + tag
  const closeVal = '</value>'
  const openVal = '<value>'
  const closeTag = '</' + tag + '>'
  const start = xml.indexOf(openTag)
  if (start === -1) return null
  const end = xml.indexOf(closeTag, start)
  const block = end === -1 ? xml.slice(start) : xml.slice(start, end + closeTag.length)
  const vi = block.indexOf(openVal)
  if (vi !== -1) {
    const ve = block.indexOf(closeVal, vi)
    if (ve !== -1) return block.slice(vi + openVal.length, ve).trim()
  }
  // Fallback: direct <tag>value</tag>
  const di = block.indexOf('>')
  const de = block.indexOf(closeTag)
  if (di !== -1 && de !== -1 && de > di + 1) {
    const v = block.slice(di + 1, de).trim()
    if (!v.startsWith('<')) return v
  }
  return null
}
function xmlBlocks(xml, tag) {
  const out = []
  const open = '<' + tag, close = '</' + tag + '>'
  let pos = 0
  while (true) {
    const s = xml.indexOf(open, pos)
    if (s === -1) break
    const bodyStart = xml.indexOf('>', s)
    if (bodyStart === -1) break
    const e = xml.indexOf(close, bodyStart)
    if (e === -1) break
    out.push(xml.slice(bodyStart + 1, e))
    pos = e + close.length
  }
  return out
}

/* ── CIK lookup (cached per ticker in KV, 30d TTL) ─────── */
async function getTickerCIK(ticker, kv) {
  const cached = await kv.get(`cik:${ticker}`)
  if (cached) return cached
  const data = await fetchJSON('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'TradePoint Lab opensource@tradepoint.dev' }
  }).catch(() => null)
  if (!data) return null
  const entry = Object.values(data).find(e => e.ticker === ticker)
  if (!entry) return null
  const cik = String(entry.cik_str)
  await kv.put(`cik:${ticker}`, cik, { expirationTtl: 30 * 24 * 60 * 60 })
  return cik
}

/* ── Parse a single Form 4 XML string ───────────────────── */
function parseForm4XML(xml, accessionNo, filedDate) {
  const ownerName    = xmlVal(xml, 'rptOwnerName') || 'Unknown'
  const personCik    = xmlVal(xml, 'rptOwnerCik') || null   // SEC reporting owner CIK
  const isOfficer    = xmlVal(xml, 'isOfficer')  === '1'
  const isDirector   = xmlVal(xml, 'isDirector') === '1'
  const officerTitle = xmlVal(xml, 'officerTitle')
  const title = officerTitle || (isDirector ? 'Director' : isOfficer ? 'Officer' : 'Insider')

  // Collect footnotes for 10b5-1 detection
  const fnMap = {}
  const fnRe = /<footnote id="([^"]+)"[^>]*>([^<]*)<\/footnote>/g
  let fnM; while ((fnM = fnRe.exec(xml))) fnMap[fnM[1]] = fnM[2]
  const global10b51 = /10b5-?1|rule\s+10b5/i.test(xml)

  const results = []
  let txIdx = 0
  for (const block of xmlBlocks(xml, 'nonDerivativeTransaction')) {
    const code       = xmlVal(block, 'transactionCode')
    const txDate     = xmlVal(block, 'transactionDate')
    const shares     = parseFloat(xmlVal(block, 'transactionShares')            || '0')
    const price      = parseFloat(xmlVal(block, 'transactionPricePerShare')     || '0')
    const adCode     = xmlVal(block, 'transactionAcquiredDisposedCode')
    const sharesAfter= parseFloat(xmlVal(block, 'sharesOwnedFollowingTransaction') || '0')
    if (!code || !shares) continue

    const fnIds = [...block.matchAll(/footnoteId[^>]*id="([^"]+)"/g)].map(m => m[1])
    const is10b51 = global10b51 || fnIds.some(id => /10b5/i.test(fnMap[id] || ''))

    results.push({
      accession_no: accessionNo, filed_date: filedDate,
      person_name: ownerName, person_cik: personCik, person_title: title,
      is_officer: isOfficer ? 1 : 0, is_director: isDirector ? 1 : 0,
      transaction_date: txDate || filedDate,
      transaction_code: code,
      transaction_table: 'non_derivative',   // only non-derivative parsed in v1
      transaction_index: txIdx,              // 0-based position in XML table
      shares, price_per_share: price,
      value_usd: shares * price, shares_after: sharesAfter,
      acquired_disposed: adCode || (code === 'P' ? 'A' : 'D'),
      is_10b5_1: is10b51 ? 1 : 0,
    })
    txIdx++
  }
  return results
}

/* ── Insider classifier constants — versionable ─────────── */
const INSIDER_WINDOW_DAYS                 = 90
const MATERIAL_BUY_THRESHOLD_USD          = 1_000_000
const ELEVATED_SELLING_THRESHOLD_USD      = 5_000_000
const ELEVATED_SELLING_NET_THRESHOLD_USD  = 1_000_000
const ELEVATED_SELLING_MIN_HOLDINGS_PCT   = 5          // % of pre-tx holdings to flag
const INSIDER_CLASSIFIER_VERSION          = 'insider-v1.0'

/* ── Accurate, neutral code descriptions (SEC official meanings) ─────── */
const TX_CODE_LABEL = {
  P: 'Open-market purchase',
  S: 'Open-market sale',
  A: 'Grant or award',
  D: 'Disposition to issuer',
  F: 'Tax withholding via share surrender',
  M: 'Exercise or conversion of derivative',
  G: 'Gift',
  X: 'In-the-money derivative exercise',
  C: 'Conversion of derivative',
  W: 'Inheritance',
  I: 'Discretionary transaction (plan)',
  U: 'Tender of shares in an exchange offer',
}
const COMP_CODES = ['F', 'M', 'X', 'C', 'A']

/* ── Summarise transactions into the UI payload ─────────── */
function computeInsiderSummary(transactions, debug = {}) {
  // Discretionary: open-market buys (P) and sells (S)
  const discretionary = transactions.filter(tx => tx.transaction_code === 'P' || tx.transaction_code === 'S')
  const purchases     = discretionary.filter(tx => tx.transaction_code === 'P')
  const sales         = discretionary.filter(tx => tx.transaction_code === 'S')

  // Compensation: RSU vesting (M), tax withholding (F), option exercise (X)
  const compensation = transactions
    .filter(tx => COMP_CODES.includes(tx.transaction_code))
    .sort((a, b) => b.filed_date.localeCompare(a.filed_date))
    .slice(0, 5)

  const purchasesTotal = purchases.reduce((s, tx) => s + (tx.value_usd || 0), 0)
  const salesTotal     = sales.reduce((s, tx) => s + (tx.value_usd || 0), 0)
  const netTotal       = purchasesTotal - salesTotal

  const allSales10b51  = sales.length > 0 && sales.every(tx => tx.is_10b5_1)
  const someSales10b51 = sales.some(tx => tx.is_10b5_1)

  // Three-state exercise-and-sell detection:
  //   'confirmed' — same filing + same owner (strongest, mitigates classification)
  //   'possible'  — same owner within 3 days (inference, adds note but doesn't mitigate)
  //   'none'      — no M+S relationship found
  const allExercises = transactions.filter(tx => tx.transaction_code === 'M')
  let exerciseAndSell = 'none'
  outer: for (const ex of allExercises) {
    for (const sale of sales) {
      const sameOwner = (ex.person_cik && sale.person_cik && ex.person_cik === sale.person_cik) ||
                        (ex.person_name && ex.person_name === sale.person_name)
      // Confirmed: same filing AND same owner
      if (ex.accession_no && ex.accession_no === sale.accession_no && sameOwner) {
        exerciseAndSell = 'confirmed'; break outer
      }
      // Possible: same owner within 3 days (weaker inference)
      if (sameOwner) {
        const exDate   = new Date(ex.transaction_date   || ex.filed_date)
        const saleDate = new Date(sale.transaction_date || sale.filed_date)
        if (Math.abs(exDate - saleDate) / 86_400_000 <= 3) {
          exerciseAndSell = 'possible'   // keep scanning — 'confirmed' still possible
        }
      }
    }
  }
  const hasExerciseAndSell = exerciseAndSell === 'confirmed'   // only 'confirmed' mitigates

  // Max % of holdings sold by any single insider (0 if shares_after unavailable)
  const maxSalePctHoldings = sales.reduce((max, tx) => {
    if (!tx.shares_after || tx.shares_after <= 0 || !tx.shares) return max
    return Math.max(max, (tx.shares / (tx.shares + tx.shares_after)) * 100)
  }, 0)

  let classification
  if (discretionary.length === 0) {
    classification = 'Neutral'
  } else if (purchasesTotal >= MATERIAL_BUY_THRESHOLD_USD && salesTotal < purchasesTotal) {
    classification = 'Material Insider Buying'
  } else if (purchases.length > 0 && sales.length === 0) {
    classification = 'Constructive'
  } else if (allSales10b51) {
    classification = 'Neutral'
  } else if (
    salesTotal >= ELEVATED_SELLING_THRESHOLD_USD &&
    !allSales10b51 && exerciseAndSell !== 'confirmed'
  ) {
    classification = 'Elevated Selling'  // 'possible' doesn't mitigate classification
  } else if (
    netTotal <= -ELEVATED_SELLING_NET_THRESHOLD_USD &&
    !allSales10b51 && exerciseAndSell !== 'confirmed' &&
    maxSalePctHoldings >= ELEVATED_SELLING_MIN_HOLDINGS_PCT
  ) {
    classification = 'Elevated Selling'
  } else {
    classification = 'Neutral'
  }

  // Key event: person who sold the highest % of their holdings
  let keyEvent = null, maxPct = 0
  for (const tx of sales) {
    if (tx.shares > 0 && tx.shares_after >= 0) {
      const pct = (tx.shares / (tx.shares + tx.shares_after)) * 100
      if (pct > maxPct) { maxPct = pct; keyEvent = { ...tx, pctSold: pct } }
    }
  }
  if (!keyEvent && purchases.length > 0) {
    keyEvent = purchases.reduce((best, tx) => (tx.value_usd > (best?.value_usd || 0) ? tx : best), null)
  }

  // Use module-level TX_CODE_LABEL for all code descriptions

  return {
    period: '90d', purchasesTotal, salesTotal, netTotal,
    purchasesCount: purchases.length, salesCount: sales.length,
    allSales10b51, someSales10b51, classification,
    keyEvent: keyEvent ? {
      name:    keyEvent.person_name,
      title:   keyEvent.person_title,
      action:  keyEvent.transaction_code === 'S' ? 'sold' : 'bought',
      // pctOfHoldings: null when shares_after is unavailable — never estimate
      pctOfHoldings: (keyEvent.pctSold != null && keyEvent.pctSold > 0 && keyEvent.shares_after > 0)
        ? parseFloat(keyEvent.pctSold.toFixed(1)) : null,
      value:   keyEvent.value_usd,
      shares:  keyEvent.shares,
      date:    keyEvent.transaction_date || keyEvent.filed_date,
      is10b51: keyEvent.is_10b5_1 === 1,
      exerciseAndSell: exerciseAndSell,  // 'confirmed' | 'possible' | 'none'
    } : null,
    recentTransactions: [...discretionary]
      .sort((a, b) => b.filed_date.localeCompare(a.filed_date))
      .slice(0, 10)
      .map(tx => ({
        name: tx.person_name, title: tx.person_title, code: tx.transaction_code,
        shares: tx.shares, price: tx.price_per_share, value: tx.value_usd,
        date: tx.transaction_date || tx.filed_date, is10b51: tx.is_10b5_1 === 1,
      })),
    compensationActivity: compensation.map(tx => ({
      name: tx.person_name, title: tx.person_title,
      label: TX_CODE_LABEL[tx.transaction_code] || tx.transaction_code,
      shares: tx.shares, value: tx.value_usd,
      date: tx.transaction_date || tx.filed_date,
    })),
    noActivity:          discretionary.length === 0,
    hasCompensation:     compensation.length > 0,
    totalRawTx:          transactions.length,
    classifierVersion:   INSIDER_CLASSIFIER_VERSION,
    hasExerciseAndSell:  exerciseAndSell !== 'none',
    exerciseAndSellState: exerciseAndSell,
    // Debug info — visible in the UI to diagnose parsing issues
    _debug: {
      filingsFound:    debug.filingsFound    ?? 0,
      newParsed:       debug.newParsed       ?? 0,
      rawTxCount:      transactions.length,
      codeCounts:      transactions.reduce((acc, tx) => {
        acc[tx.transaction_code] = (acc[tx.transaction_code] || 0) + 1; return acc
      }, {}),
      docsSample:      debug.docsSample ?? [],
    },
  }
}

/* ── Main handler ────────────────────────────────────────── */

/* ── Fetch Form 4 XML with fallback to filing index ─────────
   primaryDocument is often the HTML-rendered version.
   If it doesn't contain Form 4 XML tags, we fetch the EDGAR
   filing index JSON and locate the actual .xml document.
─────────────────────────────────────────────────────────── */
async function fetchForm4Xml(cik, accNoDashes, primaryDoc, secHdr) {
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDashes}`

  // Valid Form 4 XML contains these root-level tags
  const isForm4 = txt =>
    txt?.includes('<nonDerivativeTransaction') ||
    txt?.includes('<derivativeTransaction')    ||
    txt?.includes('<ownershipDocument')

  // Try 1: primaryDocument as-is
  if (primaryDoc) {
    const txt = await fetch(`${base}/${primaryDoc}`, { headers: secHdr })
      .then(r => r.ok ? r.text() : null).catch(() => null)
    if (isForm4(txt)) return txt

    // Try 2: strip XSL/style prefix if present
    // SEC often stores as "xslF345X06/tm2618092-2_4seq1.xml" but the
    // actual parseable XML lives at "tm2618092-2_4seq1.xml" (root of accession)
    const slashIdx = primaryDoc.lastIndexOf('/')
    if (slashIdx > 0) {
      const basename = primaryDoc.slice(slashIdx + 1)
      await delay(100)
      const txt2 = await fetch(`${base}/${basename}`, { headers: secHdr })
        .then(r => r.ok ? r.text() : null).catch(() => null)
      if (isForm4(txt2)) return txt2
    }
  }

  // Try 3: filing index JSON → find the .xml document
  await delay(120)
  const idx = await fetch(`${base}/${accNoDashes}-index.json`, { headers: secHdr })
    .then(r => r.ok ? r.json() : null).catch(() => null)

  const xmlEntry = (idx?.directory?.item ?? []).find(item =>
    item.name?.endsWith('.xml') &&
    !item.name?.startsWith('R') &&                          // skip XBRL viewer fragments
    (item.type === '4' || /4seq|form4|ownership/i.test(item.name ?? ''))
  )
  if (!xmlEntry) return null

  await delay(120)
  return fetch(`${base}/${xmlEntry.name}`, { headers: secHdr })
    .then(r => r.ok ? r.text() : null).catch(() => null)
}

async function handleInsiderActivity(ticker, kv, db) {
  const t = ticker.toUpperCase()
  const kvKey = `insider:${t}`

  // 1. KV cache
  const { value, metadata } = await kvGet(kv, kvKey)
  if (value) return json({ data: value, meta: { ...metadata, fromCache: true } })

  // 2. Resolve CIK
  const cik = await getTickerCIK(t, kv)
  if (!cik) return json({ error: `CIK not found for ${t} — ticker may not be listed on SEC EDGAR` }, 404)

  const padded = cik.padStart(10, '0')
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString().split('T')[0]

  // 3. Get recent Form 4 filings from SEC
  const subs = await fetchJSON(`https://data.sec.gov/submissions/CIK${padded}.json`, {
    headers: { 'User-Agent': 'TradePoint Lab opensource@tradepoint.dev' }
  }).catch(() => null)

  if (!subs?.filings?.recent) return json({ error: 'Could not reach SEC EDGAR submissions' }, 502)

  const { form: forms, filingDate: dates, accessionNumber: accNos, primaryDocument: docs } = subs.filings.recent
  const form4Filings = []
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === '4' && dates[i] >= since90) {
      form4Filings.push({ date: dates[i], accNo: accNos[i], doc: docs[i] })
    }
  }

  // 4. Find which accession numbers we already have in D1
  let knownAccNos = new Set()
  if (db && form4Filings.length > 0) {
    try {
      const rows = await db.prepare(
        `SELECT DISTINCT accession_no FROM insider_transactions WHERE ticker = ? AND filed_date >= ?`
      ).bind(t, since90).all()
      knownAccNos = new Set((rows.results ?? []).map(r => r.accession_no))
    } catch(e) { console.error('[D1 insider read]', e.message) }
  }

  // 5. Fetch + parse only new filings
  const newFilings = form4Filings.filter(f => !knownAccNos.has(f.accNo.replace(/-/g, '')))
  const allNewTx = []

  const secHdr = { 'User-Agent': 'TradePoint Lab opensource@tradepoint.dev' }
  let docsChecked = []

  for (const filing of newFilings) {
    await delay(120)
    const accNoDashes = filing.accNo.replace(/-/g, '')
    const xml = await fetchForm4Xml(cik, accNoDashes, filing.doc, secHdr)
    docsChecked.push(filing.doc || '(null)')

    if (!xml) continue
    const txs = parseForm4XML(xml, accNoDashes, filing.date)
    allNewTx.push(...txs)
  }

  // 6. Save new transactions to D1
  if (db && allNewTx.length > 0) {
    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO insider_transactions
          (ticker, cik, accession_no, filed_date, person_name, person_cik, person_title,
           is_officer, is_director, transaction_date, transaction_code,
           transaction_table, transaction_index,
           shares, price_per_share, value_usd, shares_after, acquired_disposed, is_10b5_1)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      await db.batch(allNewTx.map(tx => stmt.bind(
        t, cik, tx.accession_no, tx.filed_date, tx.person_name, tx.person_cik, tx.person_title,
        tx.is_officer, tx.is_director, tx.transaction_date, tx.transaction_code,
        tx.transaction_table, tx.transaction_index,
        tx.shares, tx.price_per_share, tx.value_usd, tx.shares_after,
        tx.acquired_disposed, tx.is_10b5_1
      )))
    } catch(e) { console.error('[D1 insider save]', e.message) }
  }

  // 7. Load all 90d transactions from D1 for summary
  let allTx = []
  if (db) {
    try {
      const rows = await db.prepare(
        `SELECT * FROM insider_transactions WHERE ticker = ? AND filed_date >= ? ORDER BY filed_date DESC`
      ).bind(t, since90).all()
      allTx = rows.results ?? []
    } catch(e) { console.error('[D1 insider load]', e.message) }
  }
  // Fallback: use just-parsed transactions if D1 unavailable
  if (!allTx.length) allTx = allNewTx

  // 8. Compute summary + cache
  const summary = computeInsiderSummary(allTx, { filingsFound: form4Filings.length, newParsed: newFilings.length, docsSample: docsChecked.slice(0,3) })
  const meta2 = buildMeta(t, 'insider', TTL.INSIDER, false)
  await kvSet(kv, kvKey, summary, TTL.INSIDER, meta2)
  return json({ data: summary, meta: meta2 })
}


/* ── Symbol search via Finnhub — cached 24h in KV ───────────
   Used as fallback when the local UNIVERSE doesn't have the ticker.
   Supports US stocks, ETFs, and international ADRs listed on US exchanges.
─────────────────────────────────────────────────────────── */
async function handleSymbolSearch(query, keys, kv) {
  const q = (query || '').trim().toUpperCase()
  if (!q || q.length < 1) return json({ results: [] })

  const kvKey = `search:${q}`
  const { value } = await kvGet(kv, kvKey)
  if (value) return json({ results: value, fromCache: true })

  if (!keys.finnhub) return json({ results: [], error: 'Finnhub key not configured' })

  const data = await fetchJSON(
    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${keys.finnhub}`
  ).catch(() => null)

  const results = (data?.result ?? [])
    .filter(r => {
      // Include US-listed stocks, ETFs (ETP), and common stock types
      const ok = r.type === 'Common Stock' || r.type === 'ETP' || r.type === 'ADR'
      // Exclude weird suffixes (warrants, rights, preferred)
      const clean = !r.symbol?.includes('.') || r.symbol?.endsWith('.A') || r.symbol?.endsWith('.B')
      return ok && clean && r.symbol && r.description
    })
    .map(r => ({
      ticker:   r.displaySymbol || r.symbol,
      name:     r.description,
      type:     r.type,
      exchange: r.mic ?? null,
    }))
    .slice(0, 10)

  await kv.put(kvKey, JSON.stringify(results), { expirationTtl: 24 * 60 * 60 })
  return json({ results })
}


/* ── Sector Trends: aggregate RS + breadth per industry from D1 ─────────
   Queries latest conviction analysis per ticker, groups by industry,
   computes RS multi-horizon averages and EMA breadth.
   Cached 1h in KV.
─────────────────────────────────────────────────────────────────── */
async function handleSectorTrends(db, kv, forceRefresh = false) {
  if (!db) return json({ error: 'D1 not configured' }, 503)

  const kvKey  = 'sector:trends:v1'
  if (!forceRefresh) {
    const { value } = await kvGet(kv, kvKey)
    if (value) return json({ tickers: value, fromCache: true })
  }

  try {
    // Latest analysis per ticker (last 60 days)
    const rows = await db.prepare(`
      SELECT a.ticker, a.final_score, a.grade, a.technical_score,
             a.rs_weighted, a.ema200, a.price, a.upside_pct, a.analysis_date,
             a.full_json
      FROM analyses a
      INNER JOIN (
        SELECT ticker, MAX(analysis_date) AS latest
        FROM analyses
        WHERE analysis_date >= date('now', '-60 days')
        GROUP BY ticker
      ) m ON a.ticker = m.ticker AND a.analysis_date = m.latest
    `).all()

    const tickers = (rows.results ?? []).map(r => {
      let rs1M = null, rs3M = null, rs6M = null, aboveEMA50 = null, aboveEMA200 = null
      try {
        const full = JSON.parse(r.full_json ?? '{}')
        const tech = full.technical ?? {}
        const rs   = tech.relStrengths ?? {}
        rs1M        = rs['1M']  ?? null
        rs3M        = rs['3M']  ?? null
        rs6M        = rs['6M']  ?? null
        aboveEMA50  = tech.aboveEMA50  ?? null
        aboveEMA200 = tech.aboveEMA200 ?? (r.price && r.ema200 ? r.price > r.ema200 : null)
      } catch { aboveEMA200 = r.price && r.ema200 ? r.price > r.ema200 : null }

      // Industry Trend Score: 40% RS1M + 35% RS3M + 25% RS6M (fallback to rs_weighted)
      let trendScore = null
      if (rs1M != null && rs3M != null && rs6M != null) {
        trendScore = rs1M * 0.40 + rs3M * 0.35 + rs6M * 0.25
      } else if (r.rs_weighted != null) {
        trendScore = r.rs_weighted
      }

      return {
        ticker: r.ticker,
        score: r.final_score, grade: r.grade,
        techScore: r.technical_score,
        rsWeighted: r.rs_weighted,
        rs1M, rs3M, rs6M, trendScore,
        aboveEMA200, aboveEMA50,
        price: r.price, upside: r.upside_pct, date: r.analysis_date,
      }
    })

    await kv.put(kvKey, JSON.stringify(tickers), { expirationTtl: 3600 })
    return json({ tickers })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
}


/* ── Macro Context via FRED API ──────────────────────────────────────────
   Fix 1: EFFR (daily) instead of FEDFUNDS (monthly) — current rate posture
   Fix 2: Deterministic Overall Regime via versioned lookup table (macro-v1.0)
   Fix 3: Date per series; partial failures return null, not zero
─────────────────────────────────────────────────────────────────────── */
const MACRO_REGIME_VERSION = 'macro-v1.0'

function computeOverallRegime(rateRegime, curveRegime, inflRegime) {
  // Unknown in critical dimensions → cannot determine regime
  if (rateRegime === 'Unknown' || curveRegime === 'Unknown') return 'Partial Coverage'

  // Normalize to families — explicit to avoid label-mismatch bugs
  // (e.g. 'Highly Restrictive' must behave like 'Restrictive')
  const restrictiveRate  = rateRegime === 'Restrictive' || rateRegime === 'Highly Restrictive'
  const accommodative    = rateRegime === 'Accommodative'
  const neutralHigh      = rateRegime === 'Neutral-High'

  const invertedCurve    = curveRegime === 'Inverted' || curveRegime === 'Deeply Inverted'
  const flatCurve        = curveRegime === 'Flat'
  const normalCurve      = curveRegime === 'Normal' || curveRegime === 'Steep'

  const elevatedInfl     = inflRegime === 'Elevated'
  const aboveTargetInfl  = inflRegime === 'Above Target'
  const nearTargetInfl   = inflRegime === 'Near Target' || inflRegime === 'Below Target'
  const pressuredInfl    = elevatedInfl || aboveTargetInfl

  // Lookup table — macro-v1.0
  if (restrictiveRate && invertedCurve && pressuredInfl) return 'Adverse'
  if (restrictiveRate && invertedCurve)                  return 'Restrictive'
  if (restrictiveRate && (flatCurve || elevatedInfl))    return 'Mixed'
  if (restrictiveRate && normalCurve && aboveTargetInfl) return 'Mixed'
  if (restrictiveRate && normalCurve && nearTargetInfl)  return 'Neutral'
  if (neutralHigh    && pressuredInfl)                   return 'Mixed'
  if (neutralHigh)                                       return 'Neutral'
  if (accommodative  && nearTargetInfl)                  return 'Supportive'
  if (accommodative)                                     return 'Accommodative'
  return 'Neutral'   // fallback: Neutral-High + normal curve + near target
}

async function handleMacroContext(kv, fredKey) {
  const kvKey = `macro:fred:${MACRO_REGIME_VERSION}`
  const { value: cached } = await kvGet(kv, kvKey)
  if (cached) return { data: cached, fromCache: true }
  if (!fredKey) return { data: null, error: 'FRED_KEY not configured' }

  const base   = 'https://api.stlouisfed.org/fred/series/observations'
  const params = `&api_key=${fredKey}&file_type=json&sort_order=desc&limit=5`

  const SERIES = {
    effr:    'EFFR',      // Effective Fed Funds Rate — daily, current posture
    tgtLow:  'DFEDTARL', // FOMC target lower bound
    tgtHigh: 'DFEDTARU', // FOMC target upper bound
    dgs2:    'DGS2',     // 2Y Treasury yield
    dgs10:   'DGS10',    // 10Y Treasury yield
    t10y2y:  'T10Y2Y',   // 10Y-2Y spread (FRED-computed)
    coreInf: 'CPILFESL', // Core CPI
  }

  const results = {}
  for (const [key, sid] of Object.entries(SERIES)) {
    try {
      const r = await fetchJSON(`${base}?series_id=${sid}${params}`)
      const obs = (r?.observations ?? []).find(o => o.value !== '.' && o.value !== '')
      results[key] = obs ? { date: obs.date, value: parseFloat(obs.value) } : { date: null, value: null }
    } catch { results[key] = { date: null, value: null } }
    await delay(200)
  }

  // Core CPI YoY: last 13 observations
  let coreInflYoY = null, coreInflYoYDate = null
  try {
    const r  = await fetchJSON(`${base}?series_id=CPILFESL${params}&limit=14`)
    const obs = (r?.observations ?? []).filter(o => o.value !== '.' && o.value !== '')
    if (obs.length >= 13) {
      coreInflYoY      = parseFloat(((parseFloat(obs[0].value) / parseFloat(obs[12].value) - 1) * 100).toFixed(2))
      coreInflYoYDate  = obs[0].date
    }
  } catch {}

  const effr   = results.effr?.value   ?? null
  const spread = results.t10y2y?.value ?? null

  const rateRegime = effr   == null ? 'Unknown'
    : effr >= 5.0 ? 'Highly Restrictive'
    : effr >= 3.5 ? 'Restrictive'
    : effr >= 2.5 ? 'Neutral-High'
    : effr >= 1.5 ? 'Neutral'
    : 'Accommodative'

  const curveRegime = spread == null ? 'Unknown'
    : spread <= -0.5 ? 'Deeply Inverted'
    : spread <  0    ? 'Inverted'
    : spread <  0.5  ? 'Flat'
    : spread <  1.5  ? 'Normal'
    : 'Steep'

  const inflRegime = coreInflYoY == null ? 'Unknown'
    : coreInflYoY >= 4.0 ? 'Elevated'
    : coreInflYoY >= 3.0 ? 'Above Target'
    : coreInflYoY >= 2.0 ? 'Near Target'
    : 'Below Target'

  const overallRegime = computeOverallRegime(rateRegime, curveRegime, inflRegime)

  // Coverage diagnostics — helps explain why 'Partial Coverage' appeared
  const seriesAvailable = Object.values(results).filter(r => r?.value != null).length
  const seriesExpected  = Object.keys(SERIES).length

  const data = {
    series: {
      effr:    results.effr,
      tgtLow:  results.tgtLow,
      tgtHigh: results.tgtHigh,
      dgs2:    results.dgs2,
      dgs10:   results.dgs10,
      spread:  results.t10y2y,
      coreInf: { ...results.coreInf, yoy: coreInflYoY, yoyDate: coreInflYoYDate },
    },
    computed: { coreInflYoY, rateRegime, curveRegime, inflRegime, overallRegime },
    coverage: {
      available: seriesAvailable,
      expected:  seriesExpected,
      status:    seriesAvailable === seriesExpected ? 'complete'
               : seriesAvailable > 0               ? 'partial'
               : 'unavailable',
    },
    fetchedAt: Date.now(),
    version: MACRO_REGIME_VERSION,
  }

  await kvSet(kv, kvKey, data, 24*60*60, buildMeta('macro','fred',86400,false))
  return { data }
}


/* ── OHLCV Debug: inspect D1 state for a ticker+range ─── */
async function handleOHLCVDebug(ticker, range, db) {
  const t        = ticker.toUpperCase()
  const calDays  = range === '2Y' ? 730 : range === '5Y' ? 1825 : 3650
  const nowMs    = Date.now()
  const rangeStart = new Date(nowMs - calDays * 86_400_000).toISOString().split('T')[0]

  // First: check if ohlcv_bars table exists
  let tableExists = false, tableError = null
  if (db) {
    try {
      await db.prepare(`SELECT 1 FROM ohlcv_bars LIMIT 1`).all()
      tableExists = true
    } catch(e) { tableError = e.message }
  }

  // Then: try a test insert (non-destructive, uses INSERT OR IGNORE)
  let testInsert = { ok: false, error: null }
  if (db && tableExists) {
    try {
      await db.prepare(
        `INSERT OR IGNORE INTO ohlcv_bars (ticker, bar_date, res, open, high, low, close, volume)
         VALUES ('__TEST__', '2000-01-01', 'D', 1, 1, 1, 1, 1)`
      ).run()
      // Clean it up
      await db.prepare(`DELETE FROM ohlcv_bars WHERE ticker = '__TEST__'`).run()
      testInsert = { ok: true, error: null }
    } catch(e) { testInsert = { ok: false, error: e.message } }
  }

  let d1Info = { count: 0, oldest: null, newest: null, rangeStart, tableExists, tableError, testInsert }
  if (db && tableExists) {
    try {
      const count = await db.prepare(
        `SELECT COUNT(*) as cnt, MIN(bar_date) as oldest, MAX(bar_date) as newest
         FROM ohlcv_bars WHERE ticker = ? AND res = 'D' AND bar_date >= ?`
      ).bind(t, rangeStart).first()
      d1Info = {
        ...d1Info,
        count:   count?.cnt    ?? 0,
        oldest:  count?.oldest ?? null,
        newest:  count?.newest ?? null,
      }
    } catch(e) { d1Info.queryError = e.message }
  }

  const lastStored    = d1Info.newest
  const oldestStored  = d1Info.oldest
  const daysSinceLast = lastStored
    ? (nowMs - new Date(lastStored + 'T12:00:00Z').getTime()) / 86_400_000
    : null

  const needsHistory = !oldestStored || oldestStored > rangeStart
  const needsRecent  = daysSinceLast == null || daysSinceLast > 8

  return json({
    ticker: t, range,
    d1:     d1Info,
    logic: {
      daysSinceLast: daysSinceLast?.toFixed(1),
      needsHistory,
      needsRecent,
      wouldFetch: needsHistory || needsRecent,
    },
    segments: Array.from({ length: range === '2Y' ? 2 : range === '5Y' ? 5 : 10 }, (_, i) => {
      const segYears = range === '2Y' ? 2 : range === '5Y' ? 5 : 10
      const idx = segYears - 1 - i
      const segStart = new Date(nowMs - (idx + 1) * 365 * 86_400_000).toISOString().split('T')[0]
      const segEnd   = new Date(nowMs - idx * 365 * 86_400_000).toISOString().split('T')[0]
      const isRecent = idx === 0
      const skip = isRecent
        ? (!needsRecent && oldestStored && segStart >= oldestStored)
        : (!!oldestStored && segStart >= oldestStored)
      return { segStart, segEnd, isRecent, wouldSkip: skip }
    }),
  })
}


/* ── Alpaca Direct Test — debug what Alpaca returns for a ticker ── */
async function handleAlpacaTest(ticker, keys) {
  const t = ticker.toUpperCase()
  if (!keys.alpacaKey || !keys.alpacaSecret)
    return json({ error: 'Alpaca keys not configured' }, 401)

  const hdr  = { 'APCA-API-KEY-ID': keys.alpacaKey, 'APCA-API-SECRET-KEY': keys.alpacaSecret }
  const base = 'https://data.alpaca.markets/v2/stocks'
  const results = {}

  // ── Test 1: Latest snapshot — includes latestTrade, latestQuote, dailyBar ──
  // This is the most important test for extended hours: latestTrade can be
  // from pre/post market if called during those sessions.
  try {
    const r = await fetchJSON(`${base}/${t}/snapshot?feed=iex`, { headers: hdr })
    const snap = r?.snapshot ?? r
    results.snapshot = {
      latestTrade: snap?.latestTrade
        ? { price: snap.latestTrade.p, size: snap.latestTrade.s,
            time: snap.latestTrade.t, exchange: snap.latestTrade.x }
        : null,
      latestQuote: snap?.latestQuote
        ? { bidPrice: snap.latestQuote.bp, askPrice: snap.latestQuote.ap,
            time: snap.latestQuote.t }
        : null,
      minuteBar: snap?.minuteBar
        ? { open: snap.minuteBar.o, close: snap.minuteBar.c,
            time: snap.minuteBar.t, volume: snap.minuteBar.v }
        : null,
      dailyBar: snap?.dailyBar
        ? { open: snap.dailyBar.o, close: snap.dailyBar.c,
            time: snap.dailyBar.t, volume: snap.dailyBar.v }
        : null,
      prevDailyBar: snap?.prevDailyBar
        ? { open: snap.prevDailyBar.o, close: snap.prevDailyBar.c,
            time: snap.prevDailyBar.t }
        : null,
      error: r?.message ?? null,
    }
  } catch(e) { results.snapshot = { error: e.message } }

  // ── Test 2: Latest trade ──────────────────────────────────────────────────
  // During pre/post market, this reflects the most recent extended hours trade
  try {
    const r = await fetchJSON(`${base}/${t}/trades/latest?feed=iex`, { headers: hdr })
    const tr = r?.trade ?? r?.trades?.[t]
    results.latestTrade = tr
      ? { price: tr.p, size: tr.s, time: tr.t, exchange: tr.x, conditions: tr.c }
      : { error: r?.message ?? 'No trade data' }
  } catch(e) { results.latestTrade = { error: e.message } }

  // ── Test 3: Latest quote ──────────────────────────────────────────────────
  try {
    const r = await fetchJSON(`${base}/${t}/quotes/latest?feed=iex`, { headers: hdr })
    const qt = r?.quote ?? r?.quotes?.[t]
    results.latestQuote = qt
      ? { bid: qt.bp, bidSize: qt.bs, ask: qt.ap, askSize: qt.as, time: qt.t }
      : { error: r?.message ?? 'No quote data' }
  } catch(e) { results.latestQuote = { error: e.message } }

  // ── Test 4: Intraday 1Min bars (last 30 mins) — shows if AH bars exist ───
  const nowMs = Date.now()
  const thirtyMinAgo = new Date(nowMs - 30 * 60 * 1000).toISOString()
  try {
    const r = await fetchJSON(
      `${base}/${t}/bars?timeframe=1Min&start=${thirtyMinAgo}&limit=30&feed=iex`,
      { headers: hdr }
    )
    const bars = r?.bars ?? []
    results.recentMinuteBars = {
      count:     bars.length,
      firstTime: bars[0]?.t  ?? null,
      lastTime:  bars[bars.length-1]?.t ?? null,
      lastClose: bars[bars.length-1]?.c ?? null,
      error:     r?.message ?? null,
    }
  } catch(e) { results.recentMinuteBars = { error: e.message } }

  // ── Test 5: Previous close (for % change calculation) ────────────────────
  const today  = new Date(nowMs).toISOString().split('T')[0]
  const recent = new Date(nowMs - 5 * 86_400_000).toISOString().split('T')[0]
  try {
    const r = await fetchJSON(
      `${base}/${t}/bars?timeframe=1Day&start=${recent}&end=${today}&limit=5&feed=iex&adjustment=split`,
      { headers: hdr }
    )
    const bars = r?.bars ?? []
    results.dailyBars = {
      count:     bars.length,
      dates:     bars.map(b => b.t?.split('T')[0]),
      lastClose: bars[bars.length-1]?.c ?? null,
      prevClose: bars[bars.length-2]?.c ?? null,
      error:     r?.message ?? null,
    }
  } catch(e) { results.dailyBars = { error: e.message } }

  // ── Summary: can Alpaca serve extended hours? ──────────────────────────────
  const tradeTime    = results.snapshot?.latestTrade?.time ?? results.latestTrade?.time ?? null
  const isExtended   = tradeTime ? (() => {
    const h = new Date(tradeTime).toLocaleString('en-US', { timeZone:'America/New_York', hour:'numeric', hour12:false })
    const hour = parseInt(h)
    return hour < 9 || hour >= 16
  })() : null

  return json({
    ticker: t,
    timestamp: new Date().toISOString(),
    extendedHoursSummary: {
      latestTradeTime: tradeTime,
      isExtendedHours: isExtended,
      latestPrice:     results.snapshot?.latestTrade?.price ?? results.latestTrade?.price ?? null,
      minuteBarAvailable: (results.recentMinuteBars?.count ?? 0) > 0,
      conclusion: isExtended === true
        ? 'Alpaca IEX IS providing extended hours data — can use as primary source'
        : isExtended === false
        ? 'Alpaca has data but it is regular session — Yahoo needed for extended hours'
        : 'Cannot determine — run during pre/post market hours for accurate test',
    },
    results,
  })
}


/* ── OHLCV Force Fetch — bypasses KV, calls Alpaca, saves to D1 ── */
async function handleOHLCVForce(ticker, range, keys, db) {
  const t       = ticker.toUpperCase()
  const calDays = range === '2Y' ? 730 : range === '5Y' ? 1825 : 3650
  const nowMs   = Date.now()
  const rangeStart = new Date(nowMs - calDays * 86_400_000).toISOString().split('T')[0]
  const log = []

  if (!keys.alpacaKey || !keys.alpacaSecret)
    return json({ error: 'Alpaca keys not configured' })

  const hdr      = { 'APCA-API-KEY-ID': keys.alpacaKey, 'APCA-API-SECRET-KEY': keys.alpacaSecret }
  const segYears = range === '2Y' ? 2 : range === '5Y' ? 5 : 10
  const allBars  = []

  for (let i = segYears - 1; i >= 0; i--) {
    const segEnd   = new Date(nowMs - i * 365 * 86_400_000).toISOString().split('T')[0]
    const segStart = new Date(nowMs - (i + 1) * 365 * 86_400_000).toISOString().split('T')[0]
    log.push({ step: `seg-${i}`, segStart, segEnd, status: 'starting' })

    try {
      const raw = await fetchJSON(
        `https://data.alpaca.markets/v2/stocks/${t}/bars?timeframe=1Day&start=${segStart}&end=${segEnd}&limit=300&feed=iex&adjustment=split`,
        { headers: hdr }
      )
      const bars = (raw?.bars ?? []).map(b => ({
        bar_date: new Date(b.t).toISOString().split('T')[0],
        close: parseFloat(b.c.toFixed(2)), open: b.o, high: b.h, low: b.l, volume: b.v,
      }))
      log[log.length-1].barsReceived = bars.length
      log[log.length-1].alpacaError  = raw?.message ?? null
      allBars.push(...bars)
    } catch(e) {
      log[log.length-1].fetchError = e.message
    }
  }

  log.push({ step: 'total', allBarsCount: allBars.length })

  // Save to D1 in chunks of 75
  let savedCount = 0, chunkErrors = []
  if (db && allBars.length > 0) {
    const CHUNK = 75
    const stmt  = db.prepare(
      'INSERT OR IGNORE INTO ohlcv_bars (ticker, bar_date, res, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    for (let ci = 0; ci < allBars.length; ci += CHUNK) {
      const chunk = allBars.slice(ci, ci + CHUNK)
      try {
        await db.batch(chunk.map(b => stmt.bind(t, b.bar_date, 'D', b.open, b.high, b.low, b.close, b.volume)))
        savedCount += chunk.length
      } catch(e) {
        chunkErrors.push({ ci, error: e.message })
      }
    }
    log.push({ step: 'd1-save', savedCount, chunkErrors, totalBars: allBars.length })
  }

  // Verify D1
  let d1Count = 0
  if (db) {
    try {
      const r = await db.prepare(
        `SELECT COUNT(*) as cnt FROM ohlcv_bars WHERE ticker = ? AND res = 'D' AND bar_date >= ?`
      ).bind(t, rangeStart).first()
      d1Count = r?.cnt ?? 0
    } catch(e) { log.push({ step: 'd1-verify', error: e.message }) }
  }

  return json({ ticker: t, range, rangeStart, log, d1CountAfter: d1Count, success: d1Count > 0 })
}


/* ── Yahoo Finance helpers — free, no API key ────────────────────────────
   v8 chart: OHLCV up to 10 years, daily bars
   quoteSummary: analyst price targets (targetMeanPrice)
   Note: unofficial API, may break without notice.
─────────────────────────────────────────────────────────────────────── */
async function yahooOHLCV(ticker, rangeStr) {
  // rangeStr: '2y', '5y', '10y'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${rangeStr}&includePrePost=false`
  const data = await fetchJSON(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
  }).catch(() => null)
  const result = data?.chart?.result?.[0]
  if (!result?.timestamp?.length) return []
  const { timestamp, indicators } = result
  const closes  = indicators?.quote?.[0]?.close  ?? []
  const opens   = indicators?.quote?.[0]?.open   ?? []
  const highs   = indicators?.quote?.[0]?.high   ?? []
  const lows    = indicators?.quote?.[0]?.low    ?? []
  const volumes = indicators?.quote?.[0]?.volume ?? []
  return timestamp.map((ts, i) => ({
    bar_date: new Date(ts * 1000).toISOString().split('T')[0],
    close:    closes[i]  != null ? parseFloat(closes[i].toFixed(2))  : null,
    open:     opens[i]   ?? null,
    high:     highs[i]   ?? null,
    low:      lows[i]    ?? null,
    volume:   volumes[i] ?? null,
  })).filter(b => b.close != null && b.bar_date)
}

/* Yahoo Finance adapter — fallback only, not primary source.
   If Yahoo changes structure or blocks access, TradePoint continues without this data.
   All fields tagged with source:'yahoo' and asOf date for transparency. */
async function yahooQuoteSummary(ticker) {
  const modules = 'financialData,defaultKeyStatistics,calendarEvents,price'
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`
  const data = await fetchJSON(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
  }).catch(() => null)
  const result = data?.quoteSummary?.result?.[0]
  if (!result) return null

  const fd  = result.financialData     ?? {}
  const ks  = result.defaultKeyStatistics ?? {}
  const cal = result.calendarEvents     ?? {}

  // Analyst target
  const target = fd.targetMeanPrice?.raw ? {
    targetMeanPrice:   fd.targetMeanPrice.raw,
    targetHighPrice:   fd.targetHighPrice?.raw   ?? null,
    targetLowPrice:    fd.targetLowPrice?.raw    ?? null,
    targetMedianPrice: fd.targetMedianPrice?.raw ?? null,
    numberOfAnalysts:  fd.numberOfAnalystOpinions?.raw ?? null,
    recommendationKey: fd.recommendationKey ?? null,
    source: 'yahoo', fetchedAt: new Date().toISOString(),
  } : null

  // Earnings date (next earnings from calendarEvents)
  const earningsDates = cal.earnings?.earningsDate ?? []
  const nextEarnings = earningsDates
    .map(d => d.raw ? new Date(d.raw * 1000).toISOString().split('T')[0] : null)
    .filter(d => d && d >= new Date().toISOString().split('T')[0])
    .sort()[0] ?? null

  // Short interest (biweekly FINRA data — may be up to 2 weeks stale)
  // floatShares exposed for FINRA % recalculation
  const floatSharesRaw = ks.floatShares?.raw ?? null

  const shortInfo = ks.sharesShort?.raw != null ? {
    sharesShort:         ks.sharesShort.raw,
    shortPercentOfFloat: ks.shortPercentOfFloat?.raw != null
      ? parseFloat((ks.shortPercentOfFloat.raw * 100).toFixed(2)) : null,
    shortRatio:         ks.shortRatio?.raw ?? null,
    shortRatioSource:   'yahoo',
    label: ks.shortPercentOfFloat?.raw != null
      ? (ks.shortPercentOfFloat.raw < 0.05 ? 'Low'
        : ks.shortPercentOfFloat.raw < 0.10 ? 'Moderate'
        : ks.shortPercentOfFloat.raw < 0.20 ? 'Elevated' : 'High')
      : null,
    source: 'yahoo',
  } : null

  // Institutional ownership
  const instOwn = ks.heldPercentInstitutions?.raw != null ? {
    pct: parseFloat((ks.heldPercentInstitutions.raw * 100).toFixed(1)),
    note: 'From 13F filings — may be 45+ days stale',
    source: 'yahoo',
  } : null

  // Extended hours price data
  const priceModule = result.price ?? {}
  const extHours = {
    phase: priceModule.marketState ?? null,   // PRE, REGULAR, POST, CLOSED
    regularPrice:    priceModule.regularMarketPrice?.raw   ?? null,
    regularChangePct:priceModule.regularMarketChangePercent?.raw != null
      ? parseFloat((priceModule.regularMarketChangePercent.raw * 100).toFixed(3)) : null,
    preMarketPrice:  priceModule.preMarketPrice?.raw   ?? null,
    preMarketChangePct: priceModule.preMarketChangePercent?.raw != null
      ? parseFloat((priceModule.preMarketChangePercent.raw * 100).toFixed(3)) : null,
    postMarketPrice: priceModule.postMarketPrice?.raw  ?? null,
    postMarketChangePct: priceModule.postMarketChangePercent?.raw != null
      ? parseFloat((priceModule.postMarketChangePercent.raw * 100).toFixed(3)) : null,
    prevClose:       priceModule.regularMarketPreviousClose?.raw ?? null,
  }

  return { target, nextEarnings, shortInfo, instOwn, extHours, floatShares: floatSharesRaw }
}

// Keep old name as thin wrapper for backward compat
async function yahooTargetPrice(ticker) {
  const r = await yahooQuoteSummary(ticker)
  return r?.target ?? null
}


/* ── OHLCV Segment Continuity Validator ─────────────────────────────────
   Checks data quality and cross-source boundaries. Never discards bars.
   
   Severity:
     info    — duplicates removed (expected when segments overlap)
     warning — unexpected calendar gap (suspension, listing, holiday)
     error   — OHLC corrupt, negative values, adjustment mismatch (>30%)
   
   Dedup policy (explicit):
     Same date from multiple sources → keep Alpaca, discard Yahoo
     Same source, same date → keep first encountered
─────────────────────────────────────────────────────────────────────── */
function validateOHLCV(bars) {
  const events  = []           // {severity, type, ...detail}
  const dedupMap = new Map()   // bar_date → bar (Alpaca preferred over Yahoo)
  let prev = null

  // Pass 1: dedup with source preference (Alpaca > Yahoo > other)
  for (const b of bars) {
    const existing = dedupMap.get(b.bar_date)
    if (existing) {
      // Keep Alpaca; discard Yahoo duplicate
      const keepExisting = existing._source !== 'yahoo' || b._source === 'yahoo'
      if (keepExisting) {
        events.push({ severity:'info', type:'duplicate_removed', bar_date: b.bar_date,
          kept: existing._source ?? 'alpaca', discarded: b._source ?? 'alpaca' })
        continue
      } else {
        events.push({ severity:'info', type:'duplicate_removed', bar_date: b.bar_date,
          kept: b._source ?? 'alpaca', discarded: existing._source ?? 'yahoo' })
      }
    }
    dedupMap.set(b.bar_date, b)
  }

  // Pass 2: quality checks on deduplicated sorted series
  const sorted = [...dedupMap.values()].sort((a, b) => a.bar_date.localeCompare(b.bar_date))

  for (const b of sorted) {
    // OHLC sanity — check all relationships
    if (b.low != null && b.high != null) {
      if (b.low < 0 || b.high < 0)
        events.push({ severity:'error', type:'negative_price', bar_date: b.bar_date, low: b.low, high: b.high })
      else if (b.low > b.high)
        events.push({ severity:'error', type:'low_exceeds_high', bar_date: b.bar_date, low: b.low, high: b.high })
      if (b.open != null && (b.open < b.low || b.open > b.high))
        events.push({ severity:'error', type:'open_out_of_range', bar_date: b.bar_date })
      if (b.close != null && (b.close < b.low || b.close > b.high))
        events.push({ severity:'error', type:'close_out_of_range', bar_date: b.bar_date })
    }
    if (b.volume != null && b.volume < 0)
      events.push({ severity:'error', type:'negative_volume', bar_date: b.bar_date, volume: b.volume })

    if (prev) {
      // Source boundary gap check
      if (prev._source !== b._source && prev.close && b.close) {
        const gapPct = Math.abs((b.close - prev.close) / prev.close * 100)
        if (gapPct > 30)
          events.push({ severity:'error', type:'possible_adjustment_mismatch',
            boundaryDate: b.bar_date, gapPct: parseFloat(gapPct.toFixed(1)),
            sources: [prev._source ?? 'alpaca', b._source ?? 'alpaca'],
            prevClose: prev.close, nextClose: b.close })
      }
      // Unexpected calendar gap > 7 days
      const dayGap = (new Date(b.bar_date) - new Date(prev.bar_date)) / 86_400_000
      if (dayGap > 7)
        events.push({ severity:'warning', type:'unexpected_calendar_gap',
          from: prev.bar_date, to: b.bar_date, calendarDays: Math.round(dayGap) })
    }
    prev = b
  }

  const errors   = events.filter(e => e.severity === 'error')
  const warnings = events.filter(e => e.severity === 'warning')
  const ok       = errors.length === 0   // errors degrade quality; warnings are informational

  return {
    ok, barCount: sorted.length,
    status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok',
    events: events.length > 0 ? events : null,
  }
}


/* ── FINRA Short Interest — official biweekly data, no API key required ──
   Source: FINRA Equity Short Interest (https://api.finra.org)
   Published twice monthly. settlementDate = actual FINRA reporting date.
   Returns shares short + days-to-cover from official source.
   Float (for % calculation) comes from Yahoo — hybrid but transparent.
─────────────────────────────────────────────────────────────────────── */
async function finraShortInterest(ticker) {
  try {
    const domainFilter = JSON.stringify([{ fieldName: 'symbolCode', values: [ticker.toUpperCase()] }])
    const url = `https://api.finra.org/data/group/equity/name/shortInterest?limit=1`
      + `&domainFilters=${encodeURIComponent(domainFilter)}&sortFields=${encodeURIComponent('[-settlementDate]')}`

    const data = await fetchJSON(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'TradePoint/1.0' }
    }).catch(() => null)

    if (!Array.isArray(data) || data.length === 0) return null
    const r = data[0]
    return {
      sharesShort:       r.shortInterest              ?? null,
      shortRatio:        r.shortParInterestRatio      ?? null,  // days to cover from FINRA
      shortRatioSource:  r.shortParInterestRatio != null ? 'finra' : null,
      settlementDate:    r.settlementDate             ?? null,
      percentChangePrev: r.percentChangePreviousSettlementDate ?? null,
      source:  'finra',
      dataset: 'finra_equity_short_interest',   // NOT daily short-sale volume (Reg SHO)
    }
  } catch { return null }
}


/* ── Analyst Fields re-fetch (fast, 48h TTL) ─────────────────────────────
   Only calls price-target + recommendations + Yahoo.
   Used when fundamentals cache is fresh but analyst fields are stale.
─────────────────────────────────────────────────────────────────────── */
async function fetchAnalystFields(ticker, keys) {
  const t = ticker.toUpperCase()
  if (!keys.finnhub) return null
  try {
    // Price target (retry once)
    let fhTarget = await fhGet(`/stock/price-target?symbol=${t}`, keys.finnhub)
    if (!fhTarget?.targetMean) {
      await delay(300)
      fhTarget = await fhGet(`/stock/price-target?symbol=${t}`, keys.finnhub)
    }

    // Yahoo fallback for target if Finnhub free returns null
    let targetSource = 'finnhub'
    if (!fhTarget?.targetMean) {
      const yhSummary = await yahooQuoteSummary(t)
      if (yhSummary?.target?.targetMeanPrice) {
        fhTarget = {
          targetMean:   yhSummary.target.targetMeanPrice,
          targetHigh:   yhSummary.target.targetHighPrice,
          targetLow:    yhSummary.target.targetLowPrice,
          targetMedian: yhSummary.target.targetMedianPrice,
        }
        targetSource = 'yahoo'
      }
    }
    await delay(200)

    // Recommendations
    const fhRecs = await fhGet(`/stock/recommendation?symbol=${t}`, keys.finnhub)
    const rec = Array.isArray(fhRecs) ? fhRecs[0] : null
    await delay(200)

    // Earnings date from Yahoo
    const yhEarnings = await yahooQuoteSummary(t).catch(() => null)

    return {
      targetMean:        fhTarget?.targetMean   ?? null,
      targetHigh:        fhTarget?.targetHigh   ?? null,
      targetLow:         fhTarget?.targetLow    ?? null,
      targetMedian:      fhTarget?.targetMedian ?? null,
      targetSource:      fhTarget?.targetMean ? targetSource : null,
      targetFetchedAt:   fhTarget?.targetMean ? new Date().toISOString() : null,
      strongBuy:         rec?.strongBuy  ?? 0,
      buy:               rec?.buy        ?? 0,
      hold:              rec?.hold       ?? 0,
      sell:              rec?.sell       ?? 0,
      strongSell:        rec?.strongSell ?? 0,
      nextEarningsDate:  yhEarnings?.nextEarnings ?? null,
      earningsDateSource:yhEarnings?.nextEarnings ? 'yahoo' : null,
      _analystRefreshedAt: Date.now(),
    }
  } catch(e) {
    console.error('[fetchAnalystFields]', ticker, e.message)
    return null
  }
}


/* ── Stooq Shadow Test — compare vs D1 (Alpaca/Yahoo) ───────────────────
   Shadow mode: fetches Stooq CSV, compares with D1 bars, reports diff.
   No production use — validates adjustment consistency before wiring.
   Stooq URL: https://stooq.com/q/d/l/?s={ticker}.us&i=d
   Returns: CSV (Date,Open,High,Low,Close,Volume), daily, all history, no auth.
─────────────────────────────────────────────────────────────────────── */
async function handleStooqTest(ticker, db) {
  const t = ticker.toUpperCase()
  const symbol = t.replace('.', '-').toLowerCase()  // BRK.B → brk-b

  // ── 1. Fetch Stooq CSV ────────────────────────────────────────────────
  let stooqBars = [], stooqError = null, stooqRawPreview = null
  const stooqSymbols = [`${symbol}.us`, `${t.toLowerCase()}.us`, `${t}.US`]
  for (const sym of stooqSymbols) {
    try {
      const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/csv,text/plain,*/*',
          'Referer': 'https://stooq.com/',
        }
      })
      if (!resp.ok) { stooqError = `HTTP ${resp.status} for ${sym}`; continue }
      const csv = await resp.text()
      stooqRawPreview = csv.slice(0, 200)  // first 200 chars for diagnosis

      // Detect if Stooq returned HTML (blocked/redirected) vs CSV
      if (csv.trim().startsWith('<') || csv.includes('<!DOCTYPE')) {
        stooqError = `Stooq returned HTML (blocked) for ${sym} — server-side requests may be blocked`
        continue
      }

      const lines = csv.trim().split('\n').slice(1)
      if (lines.length === 0 || !lines[0].includes(',')) {
        stooqError = `No CSV data returned for ${sym}`; continue
      }

      for (const line of lines) {
        const [date, open, high, low, close, volume] = line.split(',')
        if (!date || !close || close === 'null' || close.trim() === '') continue
        const c = parseFloat(close)
        if (!isFinite(c) || c <= 0) continue
        stooqBars.push({
          date: date.trim(), open: parseFloat(open), high: parseFloat(high),
          low: parseFloat(low), close: c, volume: parseInt(volume) || 0,
        })
      }
      if (stooqBars.length > 0) {
        stooqBars.reverse()  // Stooq returns newest first
        stooqError = null
        break
      }
    } catch(e) { stooqError = e.message }
  }

  // ── 2. Fetch D1 bars for comparison ───────────────────────────────────
  let d1Bars = [], d1Error = null
  if (db) {
    try {
      const rows = await db.prepare(
        `SELECT bar_date, close, open, high, low, volume
         FROM ohlcv_bars WHERE ticker = ? AND res = 'D'
         ORDER BY bar_date ASC LIMIT 2000`
      ).bind(t).all()
      d1Bars = rows.results ?? []
    } catch(e) { d1Error = e.message }
  }

  if (stooqError) return json({ ticker: t, error: stooqError, stooqUrl: `https://stooq.com/q/d/l/?s=${symbol}.us&i=d` })

  // ── 3. Compare overlap ─────────────────────────────────────────────────
  const stooqByDate = {}
  for (const b of stooqBars) stooqByDate[b.date] = b

  const d1ByDate = {}
  for (const b of d1Bars) d1ByDate[b.bar_date] = b

  const d1Dates   = new Set(Object.keys(d1ByDate))
  const stooqDates = new Set(Object.keys(stooqByDate))
  const overlap   = [...d1Dates].filter(d => stooqDates.has(d))

  // Price divergence on overlapping dates
  const diffs = []
  let maxDiffPct = 0
  for (const date of overlap.slice(-30)) {  // check last 30 overlap days
    const d1Close    = d1ByDate[date]?.close
    const stooqClose = stooqByDate[date]?.close
    if (!d1Close || !stooqClose) continue
    const diffPct = Math.abs((stooqClose - d1Close) / d1Close * 100)
    if (diffPct > maxDiffPct) maxDiffPct = diffPct
    if (diffPct > 0.5) {
      diffs.push({ date, d1: d1Close, stooq: stooqClose, diffPct: parseFloat(diffPct.toFixed(3)) })
    }
  }

  // Coverage analysis
  const stooqOldest = stooqBars[0]?.date ?? null
  const stooqNewest = stooqBars[stooqBars.length-1]?.date ?? null
  const d1Oldest    = d1Bars[0]?.bar_date ?? null
  const d1Newest    = d1Bars[d1Bars.length-1]?.bar_date ?? null

  // Adjustment check: compare around known NVDA split dates
  // NVDA had 10:1 split on 2024-06-10
  const splitCheck = stooqByDate['2024-06-09']
  const splitCheckD1 = d1ByDate['2024-06-09']

  // Verdict
  const maxDiff = parseFloat(maxDiffPct.toFixed(3))
  const verdict = stooqBars.length === 0
    ? 'No data from Stooq — symbol not found or blocked'
    : diffs.length === 0
    ? 'Prices match (< 0.5% divergence on all overlap days) — safe to use as fallback'
    : maxDiff < 2
    ? 'Minor divergence (< 2%) — likely rounding or data freshness difference'
    : maxDiff < 10
    ? 'Moderate divergence — possible adjustment mismatch, do NOT use without further validation'
    : 'Large divergence — adjustment method differs, NOT safe to mix with Alpaca/Yahoo'

  return json({
    ticker: t,
    stooqUrl:    `https://stooq.com/q/d/l/?s=${symbol}.us&i=d`,
    stooq: {
      totalBars: stooqBars.length,
      oldest: stooqOldest, newest: stooqNewest,
      error: stooqError,
      rawPreview: stooqRawPreview,  // first 200 chars — diagnose HTML vs CSV
    },
    d1: {
      totalBars: d1Bars.length,
      oldest: d1Oldest, newest: d1Newest,
      sources: [...new Set(d1Bars.map(b => b._source).filter(Boolean))],
      error: d1Error,
    },
    comparison: {
      overlapDays: overlap.length,
      divergentDays: diffs.length,
      maxDivergencePct: maxDiff,
      divergenceSample: diffs.slice(0, 5),
      splitCheck: splitCheck ? {
        stooq: splitCheck.close, d1: splitCheckD1?.close ?? null,
        match: splitCheckD1 ? Math.abs(splitCheck.close - splitCheckD1.close) < 0.1 : null,
        note: 'NVDA 10:1 split 2024-06-10 — both should show ~pre-split/10 price'
      } : null,
    },
    verdict,
    shadowStatus: 'NOT wired to production — diagnostic only',
  })
}

/* ════════════════════════════════════════════════════════════
   MODULE: MARKET MAP — Constituent Master + RS Calculation
   Architecture:
   - constituent_master: source of truth for S&P 500 universe
   - market_rs_daily: derived RS per security (no raw OHLCV stored)
   - industry_trend_daily: pre-aggregated per industry for UI
   - /api/market-map/latest: UI reads this, never scans raw tables
════════════════════════════════════════════════════════════ */

/** Get provider-specific symbol for a constituent — avoids ad-hoc string transforms */
function getProviderSymbol(constituent, provider) {
  if (!constituent) return null
  switch (provider) {
    case 'alpaca':   return constituent.alpaca_symbol  ?? constituent.symbol
    case 'yahoo':    return constituent.yahoo_symbol   ?? constituent.symbol?.replace(/\./, '-')
    case 'finnhub':  return constituent.finnhub_symbol ?? constituent.symbol
    case 'display':  return constituent.display_symbol ?? constituent.symbol
    case 'source':   return constituent.source_symbol  ?? constituent.symbol
    default:         return constituent.symbol
  }
}

/** Compute median of a sorted array */
function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a,b) => a-b)
  const m = Math.floor(s.length/2)
  return s.length % 2 ? s[m] : (s[m-1]+s[m])/2
}

/** Classify rotation state from RS horizons */
function classifyRotationState(rs1m, rs3m, rs6m) {
  if (rs1m == null || rs3m == null || rs6m == null) return null
  if (rs6m < -2 && rs1m > 0)  return 'Reversing Up'
  if (rs6m > 2  && rs1m < 0)  return 'Reversing Down'
  if (Math.abs(rs1m) < 2)     return 'Neutral'
  if (rs1m > rs3m && rs1m > 0) return 'Strengthening'
  if (rs1m < rs3m && rs1m < 0) return 'Weakening'
  return rs1m > 0 ? 'Leading' : 'Lagging'
}

/* ── GET /api/market-map/latest — pre-computed industry aggregates ── */
async function handleMarketMapLatest(request, db, kv) {
  if (!db) return json({ error: 'D1 not configured' }, 503)

  const url    = new URL(request.url)
  const date   = url.searchParams.get('date')  // optional override
  const refresh = url.searchParams.get('refresh') === '1'

  const cacheKey = `market-map:latest:v2`
  if (!refresh) {
    const { value } = await kvGet(kv, cacheKey)
    if (value) return json({ ...value, fromCache: true })
  }

  // Read only from 'complete' runs — never from partial or failed
  // This guarantees the UI always shows a consistent, fully-computed snapshot
  const latestRun = await db.prepare(
    `SELECT analysis_date, status, coverage_pct, symbols_processed, symbols_expected
     FROM market_map_runs
     WHERE status = 'complete'
     ORDER BY analysis_date DESC LIMIT 1`
  ).first().catch(() => null)

  const targetDate = date ?? latestRun?.analysis_date
  if (!targetDate) return json({
    tickers: [], industries: [], fromCache: false,
    message: 'No complete snapshot yet — run daily RS calculation first',
    hint: 'POST /api/admin/backfill-rs to populate initial data',
  })

  // Load industry aggregates
  const industries = await db.prepare(
    `SELECT * FROM industry_trend_daily WHERE analysis_date = ? ORDER BY trend_score DESC`
  ).bind(targetDate).all().then(r => r.results ?? []).catch(() => [])

  // Load member details for each industry (latest RS)
  const members = await db.prepare(
    `SELECT m.symbol, m.company_id, m.company_name, m.industry, m.sector, m.spy_weight,
            r.rs_1m, r.rs_3m, r.rs_6m, r.trend_score, r.data_quality,
            a.grade, a.final_score
     FROM constituent_master m
     LEFT JOIN market_rs_daily r ON r.symbol = m.symbol AND r.analysis_date = ?
     LEFT JOIN (
       SELECT ticker, grade, final_score FROM analyses
       WHERE analysis_date = (SELECT MAX(analysis_date) FROM analyses WHERE ticker = analyses.ticker)
     ) a ON a.ticker = m.symbol
     WHERE m.active_to IS NULL
     ORDER BY r.trend_score DESC NULLS LAST`
  ).bind(targetDate).all().then(r => r.results ?? []).catch(() => [])

  // Build response matching existing SectorTrendsView format
  const industryMap = {}
  for (const ind of industries) {
    industryMap[ind.industry] = {
      name: ind.industry, sector: ind.sector,
      trendScore: ind.trend_score, rs1M: ind.median_rs_1m,
      rs3M: ind.median_rs_3m, rs6M: ind.median_rs_6m,
      rotation: ind.rotation_state,
      dataCount: ind.eligible_count, tickerCount: ind.member_count,
      coveragePct: ind.coverage_pct,
      tickers: [],
    }
  }
  for (const m of members) {
    if (!industryMap[m.industry]) continue
    industryMap[m.industry].tickers.push({
      ticker: m.symbol, company: m.company_name,
      trendScore: m.trend_score, rs1M: m.rs_1m, rs3M: m.rs_3m, rs6M: m.rs_6m,
      grade: m.grade, score: m.final_score, spyWeight: m.spy_weight,
    })
  }

  const result = {
    asOf: targetDate,
    universeVersion: 'v1.0',
    industryCount: industries.length,
    tickers: Object.values(industryMap),
    snapshotStatus: latestRun?.status ?? 'complete',
    coveragePct: latestRun?.coverage_pct ?? null,
    symbolsProcessed: latestRun?.symbols_processed ?? null,
    symbolsExpected: latestRun?.symbols_expected ?? null,
    fromCache: false,
  }

  await kvSet(kv, cacheKey, result, 6*60*60, buildMeta('market','market-map',21600,false))
  return json(result)
}

/* ── POST /api/admin/constituent-import — load constituent master ── */
async function handleConstituentImport(request, db, keys) {
  if (!db) return json({ error: 'D1 not configured' }, 503)
  const isAdmin = keys.adminKey && request.headers.get('X-TradePoint-Admin-Key') === keys.adminKey
  if (!isAdmin) return json({ error: 'Admin key required' }, 401)

  const body = await request.json().catch(() => ({}))
  const constituents  = body.constituents ?? []
  const version       = body.constituentVersion ?? body.version ?? `manual-${new Date().toISOString().split('T')[0]}`
  const source        = body.source ?? 'manual'
  const dryRun        = body.dryRun === true
  const now           = new Date().toISOString().split('T')[0]

  if (!Array.isArray(constituents) || constituents.length < 10)
    return json({ error: 'constituents array required (minimum 10 entries for safety)' }, 400)

  // ── Validation pass ────────────────────────────────────────────────────
  const seenSymbols  = new Set()
  const seenCompanies = {}   // companyId → [symbols]
  let weightTotal    = 0
  const invalid      = []
  const unclassified = []
  const duplicateSymbols = []
  const normalizedRows   = []

  for (const c of constituents) {
    const symbol = (c.symbol ?? c.normalizedSymbol ?? '').toUpperCase().replace(/\./g, '-')
    if (!symbol) { invalid.push({ raw: c, reason: 'missing symbol' }); continue }

    // Duplicate detection
    if (seenSymbols.has(symbol)) { duplicateSymbols.push(symbol); continue }
    seenSymbols.add(symbol)

    // Required field check
    if (!c.company_name && !c.companyName) { invalid.push({ symbol, reason: 'missing company_name' }); continue }

    const companyId   = c.company_id ?? c.companyId ?? symbol
    const companyName = c.company_name ?? c.companyName
    const sector      = c.sector ?? null
    const industry    = c.industry ?? null
    const spyWeight   = parseFloat(c.spy_weight ?? c.spyWeight ?? 0) || null
    const needsReview = !sector || !industry || c.needsReview === true

    if (needsReview) unclassified.push({ symbol, companyName, sector, industry })

    if (spyWeight) weightTotal += spyWeight

    // Track companies with multiple share classes
    if (!seenCompanies[companyId]) seenCompanies[companyId] = []
    seenCompanies[companyId].push(symbol)

    // Provider-specific symbol normalization
    const sourceSymbol   = c.sourceSymbol ?? c.source_symbol ?? c.symbol ?? symbol
    const alpacaSymbol   = c.alpacaSymbol  ?? c.alpaca_symbol  ?? symbol  // most APIs use same as canonical
    const yahooSymbol    = c.yahooSymbol   ?? c.yahoo_symbol   ?? symbol.replace(/\./, '-')
    const finnhubSymbol  = c.finnhubSymbol ?? c.finnhub_symbol ?? symbol
    const displaySymbol  = c.displaySymbol ?? c.display_symbol ?? sourceSymbol

    // Provider symbol conflict detection
    const allProviderSymbols = [alpacaSymbol, yahooSymbol, finnhubSymbol]

    // Dual taxonomy
    const gicsSector   = c.gics_sector   ?? c.gicsSector   ?? null
    const gicsIndustry = c.gics_industry ?? c.gicsIndustry ?? null
    const tpSector     = sector   // TradePoint classification (may differ from GICS)
    const tpIndustry   = industry

    // Classification provenance
    const classificationSource     = c.classificationSource ?? c.classification_source ?? (needsReview ? 'ai-assisted' : 'manual')
    const classificationConfidence = c.classificationConfidence ?? c.classification_confidence ?? (needsReview ? 'medium' : 'high')
    const sedol       = c.sedol ?? null
    const securityId  = c.security_id ?? c.securityId ?? null

    normalizedRows.push({
      symbol, companyId, companyName,
      sector: tpSector ?? 'Unclassified', industry: tpIndustry ?? 'Unclassified',
      gicsSector, gicsIndustry, spyWeight,
      activeFrom: c.active_from ?? c.activeFrom ?? now,
      needsReview,
      sourceSymbol, alpacaSymbol, yahooSymbol, finnhubSymbol, displaySymbol,
      sedol, securityId,
      classificationSource, classificationConfidence,
    })
  }

  // Strict validation — equity holdings only (exclude cash/non-equity rows)
  // State Street files may include cash positions that inflate/distort weight totals
  const equityRows   = normalizedRows.filter(r => r.spyWeight && r.spyWeight > 0.001)
  const equityWeight = equityRows.reduce((s, r) => s + (r.spyWeight ?? 0), 0)
  const equityCount  = seenSymbols.size

  // Strict thresholds: 98-102% equity weight, 490-520 securities
  const weightOk = weightTotal === 0 || (equityWeight >= 98 && equityWeight <= 102)
  const countOk  = equityCount >= 490 && equityCount <= 520
  const duplicateCompanyIds = Object.entries(seenCompanies)
    .filter(([, syms]) => syms.length > 1).map(([id, syms]) => ({ companyId: id, symbols: syms }))

  // canCommit requires both weight and count within bounds, no invalids
  const canCommit = invalid.length === 0 && duplicateSymbols.length === 0 && weightOk && countOk

  // Dry-run: return analysis without writing
  if (dryRun) {
    // Single query with full data for all comparisons
    const existingMap = await db.prepare(`SELECT symbol, spy_weight, sector, industry FROM constituent_master WHERE active_to IS NULL`)
      .all().then(r => Object.fromEntries(r.results.map(x => [x.symbol, x]))).catch(() => ({}))

    const newSymbols      = normalizedRows.filter(r => !existingMap[r.symbol]).map(r => r.symbol)
    const updateSymbols   = normalizedRows.filter(r => !!existingMap[r.symbol])
    const deactivatedList = Object.keys(existingMap).filter(s => !seenSymbols.has(s))
    const materialWeightChanges = updateSymbols.filter(r => existingMap[r.symbol] && Math.abs((r.spyWeight??0) - (existingMap[r.symbol].spy_weight??0)) >= 0.10)
    const minorWeightChanges    = updateSymbols.filter(r => existingMap[r.symbol] && Math.abs((r.spyWeight??0) - (existingMap[r.symbol].spy_weight??0)) > 0 && Math.abs((r.spyWeight??0) - (existingMap[r.symbol].spy_weight??0)) < 0.10)

    // Provider symbol conflicts
    const providerSymbolConflicts = []
    const seenProviderSymbols = { alpaca: {}, yahoo: {}, finnhub: {} }
    for (const r of normalizedRows) {
      for (const [prov, sym] of [['alpaca', r.alpacaSymbol], ['yahoo', r.yahooSymbol], ['finnhub', r.finnhubSymbol]]) {
        if (!sym) continue
        if (seenProviderSymbols[prov][sym]) providerSymbolConflicts.push({ provider: prov, symbol: sym, securities: [seenProviderSymbols[prov][sym], r.symbol] })
        else seenProviderSymbols[prov][sym] = r.symbol
      }
    }

    return json({
      dryRun: true, canCommit, constituentVersion: version,
      received: constituents.length,
      equityCount, equityWeight: Math.round(equityWeight * 100) / 100,
      weightOk, countOk,
      inserted: newSymbols.length, newSecurities: newSymbols,
      updated: updateSymbols.length,
      materialWeightChanges: materialWeightChanges.map(r => ({ symbol: r.symbol, old: existingMap[r.symbol]?.spy_weight, new: r.spyWeight })),
      minorWeightChangesCount: minorWeightChanges.length,
      deactivated: deactivatedList.length, deactivatedList,
      unclassified: unclassified.length, unclassifiedList: unclassified,
      invalid: invalid.length,
      duplicateSymbols,
      duplicateCompanyIds,
      providerSymbolConflicts,
      needsReviewCount: normalizedRows.filter(r => r.needsReview).length,
    })
  }

  if (!canCommit)
    return json({ error: 'Validation failed — run dryRun:true first to review issues',
      invalid: invalid.length, duplicateSymbols, weightOk }, 400)

  // ── Commit pass ────────────────────────────────────────────────────────
  let inserted = 0, updated = 0, unchanged = 0

  // Get existing records for comparison
  const existing = await db.prepare(`SELECT symbol, sector, industry, spy_weight FROM constituent_master WHERE active_to IS NULL`)
    .all().then(r => Object.fromEntries(r.results.map(x => [x.symbol, x]))).catch(() => ({}))

  for (const r of normalizedRows) {
    const prev = existing[r.symbol]
    try {
      await db.prepare(`
        INSERT INTO constituent_master
          (symbol, company_id, company_name, sector, industry, spy_weight,
           display_symbol, source_symbol, alpaca_symbol, yahoo_symbol, finnhub_symbol,
           sedol, security_id, gics_sector, gics_industry,
           tradepoint_sector, tradepoint_industry,
           classification_source, classification_confidence, needs_review,
           active_from, constituent_version, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          company_id=excluded.company_id, company_name=excluded.company_name,
          sector=excluded.sector, industry=excluded.industry,
          spy_weight=excluded.spy_weight, display_symbol=excluded.display_symbol,
          source_symbol=excluded.source_symbol, alpaca_symbol=excluded.alpaca_symbol,
          yahoo_symbol=excluded.yahoo_symbol, finnhub_symbol=excluded.finnhub_symbol,
          sedol=excluded.sedol, gics_sector=excluded.gics_sector,
          gics_industry=excluded.gics_industry,
          tradepoint_sector=excluded.tradepoint_sector,
          tradepoint_industry=excluded.tradepoint_industry,
          classification_source=excluded.classification_source,
          classification_confidence=excluded.classification_confidence,
          needs_review=excluded.needs_review,
          constituent_version=excluded.constituent_version,
          source=excluded.source, updated_at=excluded.updated_at, active_to=NULL
      `).bind(
        r.symbol, r.companyId, r.companyName, r.sector, r.industry, r.spyWeight,
        r.displaySymbol, r.sourceSymbol, r.alpacaSymbol, r.yahooSymbol, r.finnhubSymbol,
        r.sedol, r.securityId, r.gicsSector, r.gicsIndustry,
        r.sector, r.industry,
        r.classificationSource, r.classificationConfidence, r.needsReview ? 1 : 0,
        r.activeFrom, version, source, now
      ).run()
      if (!prev) inserted++
      else if (prev.sector !== r.sector || Math.abs((prev.spy_weight??0) - (r.spyWeight??0)) > 0.001) updated++
      else unchanged++
    } catch(e) { invalid.push({ symbol: r.symbol, reason: e.message }) }
  }

  // Mark missing symbols as deactivated (active_to = today) — no physical delete
  const deactivated = Object.keys(existing).filter(s => !seenSymbols.has(s))
  for (const s of deactivated) {
    await db.prepare(`UPDATE constituent_master SET active_to=? WHERE symbol=? AND active_to IS NULL`)
      .bind(now, s).run().catch(() => {})
  }

  return json({
    ok: true, dryRun: false, constituentVersion: version,
    received: normalizedRows.length, inserted, updated, unchanged,
    deactivated: deactivated.length, deactivatedList: deactivated,
    unclassified: unclassified.length, unclassifiedList: unclassified,
    invalid: invalid.length, duplicateSymbols,
    duplicateCompanyIds: duplicateCompanyIds.length,
    weightTotalPct: Math.round(weightTotal * 100) / 100,
    canCommit,
  })
}

/* ── POST /api/admin/backfill-rs — compute RS for a batch of symbols ── */
async function handleBackfillRS(request, db, kv, keys) {
  if (!db) return json({ error: 'D1 not configured' }, 503)
  const isAdmin = keys.adminKey && request.headers.get('X-TradePoint-Admin-Key') === keys.adminKey
  if (!isAdmin) return json({ error: 'Admin key required' }, 401)
  if (!keys.alpacaKey || !keys.alpacaSecret) return json({ error: 'Alpaca keys required' }, 401)

  const body = await request.json().catch(() => ({}))
  const symbols = (body.symbols ?? []).slice(0, 50)  // max 50 per call to stay within Worker limits
  const targetDate = body.date ?? new Date().toISOString().split('T')[0]

  if (!symbols.length) return json({ error: 'symbols array required' }, 400)

  const alpacaHdr = { 'APCA-API-KEY-ID': keys.alpacaKey, 'APCA-API-SECRET-KEY': keys.alpacaSecret }

  // Fetch SPY baseline from Yahoo Finance (reliable for daily bars, no plan restriction)
  const spyYahoo = await fetchJSON(
    `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=13mo`
  ).catch(() => null)
  const spyTimestamps = spyYahoo?.chart?.result?.[0]?.timestamp ?? []
  const spyCloseRaw   = spyYahoo?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
  const spyClose      = spyCloseRaw.filter(v => v != null && v > 0)
  if (spyClose.length < 22) return json({
    error: 'Insufficient SPY data for RS calculation',
    barsReceived: spyClose.length,
    hint: 'Yahoo Finance SPY fetch failed or returned insufficient bars'
  }, 503)

  const spyRet = (n) => {
    if (spyClose.length < n+1) return null
    const latest = spyClose[spyClose.length-1]
    const past   = spyClose[spyClose.length-1-n]
    return past > 0 ? ((latest - past) / past) * 100 : null
  }
  const spyRs1m = spyRet(21), spyRs3m = spyRet(63), spyRs6m = spyRet(126)

  // Fetch multi-symbol bars from Alpaca — use no feed param to get best available
  const symbolsParam = encodeURIComponent(symbols.join(','))
  const barsData = await fetchJSON(
    `https://data.alpaca.markets/v2/stocks/bars?symbols=${symbolsParam}&timeframe=1Day&limit=300&adjustment=split`,
    { headers: alpacaHdr }
  ).catch(e => { console.error('[BackfillRS] Alpaca multi-bar fetch error:', e.message); return null })

  let processed = 0, insufficient = 0, errors = []

  for (const symbol of symbols) {
    const bars = barsData?.bars?.[symbol] ?? []
    const closes = bars.map(b => b.c)

    if (closes.length < 22) {
      insufficient++
      await db.prepare(`
        INSERT INTO market_rs_daily (analysis_date, symbol, company_id, industry, sector, data_quality)
        SELECT ?, ?, company_id, industry, sector, 'insufficient_history'
        FROM constituent_master WHERE symbol = ?
        ON CONFLICT(analysis_date, symbol) DO UPDATE SET data_quality='insufficient_history'
      `).bind(targetDate, symbol, symbol).run().catch(() => {})
      continue
    }

    const ret = (n) => {
      if (closes.length < n+1) return null
      const latest = closes[closes.length-1]
      const past   = closes[closes.length-1-n]
      return past > 0 ? ((latest - past) / past) * 100 : null
    }

    const tickRs1m = ret(21), tickRs3m = ret(63), tickRs6m = ret(126)
    const rs1m = (tickRs1m != null && spyRs1m != null) ? tickRs1m - spyRs1m : null
    const rs3m = (tickRs3m != null && spyRs3m != null) ? tickRs3m - spyRs3m : null
    const rs6m = (tickRs6m != null && spyRs6m != null) ? tickRs6m - spyRs6m : null

    const trendScore = rs1m != null && rs3m != null && rs6m != null
      ? rs1m * 0.40 + rs3m * 0.35 + rs6m * 0.25
      : null

    try {
      await db.prepare(`
        INSERT INTO market_rs_daily
          (analysis_date, symbol, company_id, industry, sector, rs_1m, rs_3m, rs_6m, trend_score, data_quality)
        SELECT ?, ?, company_id, industry, sector, ?, ?, ?, ?, 'ok'
        FROM constituent_master WHERE symbol = ?
        ON CONFLICT(analysis_date, symbol) DO UPDATE SET
          rs_1m=excluded.rs_1m, rs_3m=excluded.rs_3m, rs_6m=excluded.rs_6m,
          trend_score=excluded.trend_score, data_quality='ok'
      `).bind(targetDate, symbol, rs1m, rs3m, rs6m, trendScore, symbol).run()
      processed++
    } catch(e) { errors.push(`${symbol}: ${e.message}`) }
  }

  // After RS calculation, aggregate industries for this date
  await aggregateIndustries(db, targetDate)
  // Invalidate cache
  await kv.delete('market-map:latest:v2').catch(() => {})

  return json({ ok: true, date: targetDate, processed, insufficient, errors: errors.length ? errors : undefined })
}

/* ── Aggregate market_rs_daily → industry_trend_daily ── */
async function aggregateIndustries(db, date) {
  // Get all RS for this date, deduplicated by company_id (pick highest trend_score per company)
  const rows = await db.prepare(`
    SELECT r.industry, r.sector, r.company_id,
           r.rs_1m, r.rs_3m, r.rs_6m, r.trend_score, r.data_quality
    FROM market_rs_daily r
    WHERE r.analysis_date = ?
    AND r.data_quality = 'ok'
    GROUP BY r.company_id, r.industry
    HAVING r.trend_score = MAX(r.trend_score)
  `).bind(date).all().then(r => r.results ?? []).catch(() => [])

  // Get member counts per industry
  const memberCounts = await db.prepare(`
    SELECT industry, COUNT(*) as cnt FROM constituent_master
    WHERE active_to IS NULL GROUP BY industry
  `).all().then(r => r.results ?? []).catch(() => [])
  const memberMap = Object.fromEntries(memberCounts.map(r => [r.industry, r.cnt]))

  // Group by industry
  const byIndustry = {}
  for (const r of rows) {
    if (!byIndustry[r.industry]) byIndustry[r.industry] = { sector: r.sector, members: [] }
    byIndustry[r.industry].members.push(r)
  }

  for (const [industry, data] of Object.entries(byIndustry)) {
    const ms = data.members
    const rs1ms = ms.map(m => m.rs_1m).filter(v => v != null)
    const rs3ms = ms.map(m => m.rs_3m).filter(v => v != null)
    const rs6ms = ms.map(m => m.rs_6m).filter(v => v != null)
    const med1m = median(rs1ms), med3m = median(rs3ms), med6m = median(rs6ms)
    const trendScore = med1m != null && med3m != null && med6m != null
      ? med1m * 0.40 + med3m * 0.35 + med6m * 0.25 : null
    const rotation = classifyRotationState(med1m, med3m, med6m)
    const memberCount = memberMap[industry] ?? ms.length
    const eligibleCount = ms.length
    const coveragePct = memberCount > 0 ? Math.round(eligibleCount / memberCount * 100) : 0

    await db.prepare(`
      INSERT INTO industry_trend_daily
        (analysis_date, industry, sector, member_count, eligible_count, coverage_pct,
         median_rs_1m, median_rs_3m, median_rs_6m, trend_score, rotation_state)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(analysis_date, industry) DO UPDATE SET
        eligible_count=excluded.eligible_count, coverage_pct=excluded.coverage_pct,
        median_rs_1m=excluded.median_rs_1m, median_rs_3m=excluded.median_rs_3m,
        median_rs_6m=excluded.median_rs_6m, trend_score=excluded.trend_score,
        rotation_state=excluded.rotation_state
    `).bind(date, industry, data.sector, memberCount, eligibleCount, coveragePct,
             med1m, med3m, med6m, trendScore, rotation).run().catch(() => {})
  }
}

/* ════════════════════════════════════════════════════════════
   MODULE 5 — ROUTER
   Critical fix: ALL handlers use `await` so async errors are
   properly caught by the outer try-catch.
════════════════════════════════════════════════════════════ */
export default {
  // Cron Triggers:
  //   "0 0 * * 0"   → Sunday 00:00 UTC — full weekly conviction snapshot
  //   "0 21 * * 1-5" → Mon-Fri 21:00 UTC — daily RS + industry aggregation
  async scheduled(event, env, ctx) {
    const cron  = event.cron ?? ''
    const isDaily  = cron === '0 21 * * 1-5'
    const isWeekly = cron === '0 0 * * 0'
    if (isDaily)  ctx.waitUntil(handleDailyRS(env))
    if (isWeekly) ctx.waitUntil(handleWeeklySnapshot(env))
    // If cron string doesn't match (e.g. manual trigger), run both
    if (!isDaily && !isWeekly) {
      ctx.waitUntil(Promise.all([handleDailyRS(env), handleWeeklySnapshot(env)]))
    }
  },

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
          return json({ ok: true, kv: !!kv, version: '1.1.0', keys: { finnhub: !!keys.finnhub, alpaca: !!(keys.alpacaKey && keys.alpacaSecret), groq: !!keys.groq } })
        case 'fundamentals':
          return await handleFundamentals(param1, keys, kv, refresh)
        case 'prices':
          return await handleBatchPrices(url, keys, kv)
        case 'price':
          return await handlePrice(param1, keys, kv)
        case 'ohlcv':
          return await handleOHLCV(param1, param2, keys, kv, db)
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
        case 'portfolio-review':
          return await handlePortfolioReview(request, keys, kv, db)
        case 'market-intelligence':
          return await handleMarketIntelligence(param1, keys, kv)
        case 'groq-debug':
          return await handleGroqDebug(param1, param2, keys, kv)
        case 'snapshots':
          if (!param1) return await handleSnapshotStats(db)
          return await handleGetSnapshots(param1, db)
        case 'save':
          return await handleSaveAnalysis(param1, request, db)
        case 'ohlcv-force':
          return await handleOHLCVForce(param1, param2, keys, db)
        case 'stooq-test':
          return await handleStooqTest(param1, db)
        case 'alpaca-test':
          return await handleAlpacaTest(param1, keys)
        case 'ohlcv-debug':
          return await handleOHLCVDebug(param1, param2, db)
        case 'macro':
          const macroCtx = await handleMacroContext(kv, keys.fred)
          return json(macroCtx)
        case 'sector-trends':
          return await handleSectorTrends(db, kv, url.searchParams.get('refresh') === '1')
        case 'search':
          return await handleSymbolSearch(param1, keys, kv)
        case 'insider':
          return await handleInsiderActivity(param1, kv, db)
        case 'history':
          if (!param1) return await handleGetAllHistory(db)
          return await handleGetHistory(param1, db)
        case 'market-map':
          if (param1 === 'latest') return await handleMarketMapLatest(request, db, kv)
          return json({ error: 'Unknown market-map endpoint' }, 404)
        case 'constituent-import':
          return await handleConstituentImport(request, db, keys)
        case 'backfill-rs':
          return await handleBackfillRS(request, db, kv, keys)
        case 'analyst-refresh': {
          const isAdmin = keys.adminKey && request.headers.get('X-TradePoint-Admin-Key') === keys.adminKey
          if (!isAdmin) return json({ error: 'Admin key required' }, 401)
          const body2 = await request.json().catch(() => ({}))
          const tks = (body2.tickers ?? []).filter(t => /^[A-Z]{1,10}$/.test(t)).slice(0, 50)
          for (const tk of tks) { await kv.delete(`analyst:${tk}`).catch(() => {}) }
          return json({ ok: true, refreshed: tks.length, tickers: tks })
        }
        case 'cache':
          if (param1 === 'info')  return await handleCacheInfo(param2, kv)
          if (param1 === 'clear') {
            // Require TRADEPOINT_ADMIN_KEY (set via: npx wrangler secret put TRADEPOINT_ADMIN_KEY)
            // and POST method — GET must not produce side effects
            const suppliedKey = request.headers.get('X-TradePoint-Admin-Key')
            if (!keys.adminKey) return json({ error: 'Admin key not configured on server' }, 503)
            if (request.method !== 'POST') return json({ error: 'POST required for cache invalidation' }, 405)
            if (suppliedKey !== keys.adminKey) return json({ error: 'Unauthorized' }, 401)
            return await handleCacheClear(param2, kv)
          }
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
