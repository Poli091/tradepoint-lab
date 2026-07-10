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

  // Deterministic concentration rules — consistent across weeks
  const concLevel = topSector?.[1] > 50 ? 'High' : topSector?.[1] > 35 ? 'Moderate' : 'Low'
  const concRule  = topSector?.[1] > 50 ? 'sector > 50%'
                  : topSector?.[1] > 35 ? 'sector > 35%' : 'sector ≤ 35%'

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

  const metricsText = `Grades: ${Object.entries(gradeCounts).filter(([,v])=>v>0).map(([k,v])=>`${v} ${k}`).join(', ')}
Active gates: ${gatePositions.length>0?gatePositions.map(p=>p.ticker).join(', '):'none'}
Near downgrade (≤5pts from threshold): ${nearDowngrade.length>0?nearDowngrade.map(d=>`${d.ticker}(${d.score} ${d.grade}, dist=${d.distanceToDowngrade}, gate=${d.gate})`).join(', '):'none'}
Top sector: ${topSector?`${topSector[0]} ${topSector[1].toFixed(1)}% [${concLevel} — rule: ${concRule}]`:'n/a'}
Top 3 concentration: ${top3Pct.toFixed(1)}% (${top3.map(p=>p.ticker).join(', ')})
Earnings next 21 days: ${upcomingEarnings.length>0?upcomingEarnings.map(e=>`${e.ticker} in ${e.daysAway}d (${e.weight.toFixed(1)}%)`).join(', '):'none'}
Score changes vs last snapshot: ${deltas.length>0?deltas.map(d=>`${d.ticker} ${d.scoreDelta>0?'+':''}${d.scoreDelta}${d.gradeChanged?' GRADE CHANGE':''}`).join(', '):'no changes'}`

  const prompt = `You are reviewing a quantitative investment portfolio. All metrics below were computed deterministically — do not recalculate them.

POSITIONS (${positions.length}):
${posSummary}

PRE-COMPUTED METRICS:
${metricsText}

Return ONLY valid JSON:
{
  "portfolioSummary": { "status": "Constructive|Neutral|Cautious|Defensive", "text": "2-3 sentences" },
  "concentration": { "level": "Low|Moderate|High", "primaryRisk": "one line" },
  "spotlight": [{ "ticker": "...", "reason": "one sentence", "severity": "low|medium|high" }],
  "watchZone": [{ "ticker": "...", "reason": "one sentence", "trigger": "what to watch" }],
  "weeklyPriority": { "ticker": "...", "action": "Review|Monitor|Consider reducing|etc", "reason": "one sentence" },
  "dataCoverage": { "positionsAnalyzed": ${len(positions)}, "historicalComparisonsAvailable": ${len(histMap)} }
}
Rules: spotlight max 3 items. weeklyPriority is not a trade order. Use only provided data. Raw JSON only.`

  const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:'POST',
    headers:{'Authorization':`Bearer ${keys.groq}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:'llama-3.1-70b-versatile',
      messages:[{role:'user',content:prompt}],
      temperature:0.2,max_tokens:800,response_format:{type:'json_object'}})
  })
  const gd = await gr.json()
  let parsed = {}
  const rawContent = gd.choices?.[0]?.message?.content ?? '{}'
  try {
    parsed = JSON.parse(rawContent)
  } catch {
    // Groq returned invalid JSON — use deterministic fallback
    parsed = {
      portfolioSummary: {
        status: 'Neutral',
        text: 'Portfolio review temporarily unavailable. Deterministic metrics are shown below.'
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

  const data = { ...parsed,
    metrics:{ gradeCounts, gatePositions:gatePositions.map(p=>p.ticker),
      nearDowngrade, topSector, concLevel, concRule, top3Pct,
      upcomingEarnings, deltas },
    generatedAt:Date.now(), week, modelVersion }

  const meta2 = buildMeta('portfolio','portfolio-review',604800,false)
  await kvSet(kv, cacheKey, data, 604800, meta2)
  return json({ data, meta:meta2 })
}

async function handleWeeklySnapshot(env) {
  const kv = env.TRADEPOINT_KV
  const db = env.TRADEPOINT_DB
  if (!db) { console.error('[Cron] D1 not configured'); return }

  const today = new Date().toISOString().split('T')[0]
  console.log(`[Cron] Starting weekly snapshot — ${today}`)

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
   MODULE 5 — ROUTER
   Critical fix: ALL handlers use `await` so async errors are
   properly caught by the outer try-catch.
════════════════════════════════════════════════════════════ */
export default {
  // Cron Trigger — runs every Sunday at 00:00 UTC
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleWeeklySnapshot(env))
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
