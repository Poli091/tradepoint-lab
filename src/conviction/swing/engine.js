/**
 * MODULE: conviction/swing/engine.js  v2.0
 * Swing Trading Conviction Score (2–8 week horizon)
 *
 * ── Weight philosophy ───────────────────────────────────────
 *   Technical:   40pts  EMA Stack, MACD quality, RSI zone, RS vs SPY
 *   Momentum:    20pts  1M/3M price return, RVOL
 *   Volatility:  15pts  ATR quality, Beta, daily range
 *   Catalysts:   15pts  Earnings proximity, consecutive beats, guidance
 *   Quality:     10pts  ROE, Net Margin (light weight)
 *   Risk:        -5pts  max
 *
 * ── Grades (tighter for short-term signals) ─────────────────
 *   80+ STRONG BUY · 65+ BUY · 50+ HOLD · 35+ SELL · 0+ STRONG SELL
 */

/* ── Math helpers ───────────────────────────────────────── */
function calcEMA(prices, period) {
  if (!prices?.length || prices.length < period) return null
  const k = 2 / (period + 1)
  let val = prices.slice(0, period).reduce((a,b) => a+b, 0) / period
  for (let i = period; i < prices.length; i++) val = prices[i]*k + val*(1-k)
  return val
}

function calcRSI(closes, period=14) {
  if (!closes?.length || closes.length < period+1) return null
  const sl = closes.slice(-(period+1))
  let g=0, l=0
  for (let i=1; i<sl.length; i++) { const d=sl[i]-sl[i-1]; d>0?g+=d:l-=d }
  const avgG=g/period, avgL=l/period
  return avgL===0 ? 100 : 100 - (100/(1+(avgG/avgL)))
}

function calcATR(ohlcv, period=14) {
  if (!ohlcv?.length || ohlcv.length < period+1) return null
  const sl = ohlcv.slice(-(period+1))
  let sum=0
  for (let i=1; i<sl.length; i++) {
    const hi   = sl[i].high   ?? sl[i].price
    const lo   = sl[i].low    ?? sl[i].price
    const prev = sl[i-1].close ?? sl[i-1].price
    sum += Math.max(hi-lo, Math.abs(hi-prev), Math.abs(lo-prev))
  }
  return sum/period
}

function priceReturn(ohlcv, days) {
  if (!ohlcv?.length || ohlcv.length < days+1) return null
  const now  = ohlcv[ohlcv.length-1]?.price ?? ohlcv[ohlcv.length-1]?.close
  const then = ohlcv[ohlcv.length-1-days]?.price ?? ohlcv[ohlcv.length-1-days]?.close
  return now && then ? ((now/then)-1)*100 : null
}

function calcRVOL(ohlcv, days=20) {
  if (!ohlcv?.length || ohlcv.length < days+1) return null
  const recent = ohlcv[ohlcv.length-1]?.volume ?? 0
  const avg = ohlcv.slice(-days-1,-1).reduce((s,d) => s+(d.volume??0),0) / days
  return avg > 0 ? recent/avg : null
}

/* ── EMA Stack scorer (20pts) ────────────────────────── */
function scoreEMAStack(closes, current) {
  if (!closes?.length || closes.length < 201) return { score:0, detail:{} }
  const e20  = calcEMA(closes, 20)
  const e50  = calcEMA(closes, 50)
  const e200 = calcEMA(closes, 200)

  // Full alignment: price > EMA20 > EMA50 > EMA200 = 20pts
  // Partial alignment = proportional
  let score = 0
  if (e20  && current > e20)  score += 6
  if (e50  && current > e50)  score += 6
  if (e200 && current > e200) score += 4
  // Bonus: EMAs in bullish order
  if (e20 && e50 && e200 && e20 > e50 && e50 > e200) score += 4

  return { score: Math.min(score, 20), detail: { e20, e50, e200, current } }
}

/* ── MACD quality scorer (10pts) ──────────────────── */
function scoreMACD(closes) {
  if (!closes?.length || closes.length < 35) return { score:0 }
  const ema12 = calcEMA(closes, 12)
  const ema26 = calcEMA(closes, 26)
  if (!ema12 || !ema26) return { score:0 }
  const line = ema12 - ema26
  // Approximate signal with previous macd value
  const prevEma12 = calcEMA(closes.slice(0,-1), 12)
  const prevEma26 = calcEMA(closes.slice(0,-1), 26)
  const prevLine  = (prevEma12??0) - (prevEma26??0)
  const bullCross = prevLine < 0 && line > 0  // fresh crossover

  let score = 0
  if (line > 0)       score += 5   // above zero
  if (line > prevLine) score += 3  // histogram expanding (momentum building)
  if (bullCross)       score += 2  // fresh bullish crossover

  return { score: Math.min(score, 10), detail: { line, prevLine, bullCross } }
}

/* ── RSI zone scorer (5pts) ─────────────────────── */
function scoreRSI(rsi) {
  if (rsi == null) return 0
  if (rsi >= 55 && rsi <= 70) return 5   // ideal momentum zone
  if (rsi >= 45 && rsi <  55) return 3   // neutral
  if (rsi >  70 && rsi <= 78) return 2   // overbought but strong
  if (rsi >= 35 && rsi <  45) return 1   // weak but not oversold
  return 0
}

/* ── RS vs SPY scorer (5pts) ─────────────────────── */
function scoreRS(ohlcv, spyOhlcv) {
  const r1M    = priceReturn(ohlcv, 21)
  const spy1M  = priceReturn(spyOhlcv, 21)
  const r3M    = priceReturn(ohlcv, 63)
  const spy3M  = priceReturn(spyOhlcv, 63)
  const rs1M   = r1M!=null && spy1M!=null ? r1M - spy1M : null
  const rs3M   = r3M!=null && spy3M!=null ? r3M - spy3M : null

  const s1 = rs1M==null?0 : rs1M>5?3 : rs1M>0?2 : 0
  const s3 = rs3M==null?0 : rs3M>5?2 : rs3M>0?1 : 0
  return { score: Math.min(s1+s3, 5), detail: { rs1M, rs3M } }
}

/* ── Full Technical scorer (40pts) ──────────────── */
function scoreTechnical(ohlcv, spyOhlcv) {
  if (!ohlcv?.length) return { score:null, max:40, detail:{} }
  const closes  = ohlcv.map(d => d.price ?? d.close).filter(Boolean)
  const current = closes[closes.length-1]
  const rsi     = calcRSI(closes)

  const ema  = scoreEMAStack(closes, current)
  const mac  = scoreMACD(closes)
  const rs   = scoreRS(ohlcv, spyOhlcv)
  const rsiS = scoreRSI(rsi)

  return {
    score: Math.min((ema.score) + (mac.score) + (rs.score) + rsiS, 40),
    max: 40,
    detail: { ...ema.detail, rsi, rsiS, macd: mac.detail, rs1M: rs.detail.rs1M, rs3M: rs.detail.rs3M }
  }
}

/* ── Momentum scorer (20pts) ────────────────────── */
function scoreMomentum(ohlcv) {
  const r1M  = priceReturn(ohlcv, 21)
  const r3M  = priceReturn(ohlcv, 63)
  const rvol = calcRVOL(ohlcv)

  const s1M  = r1M==null?0 : r1M>15?8 : r1M>8?6 : r1M>3?4 : r1M>0?2 : 0
  const s3M  = r3M==null?0 : r3M>20?8 : r3M>10?6 : r3M>5?4 : r3M>0?2 : 0
  const sVol = rvol==null?0 : rvol>2?4 : rvol>1.5?3 : rvol>1.1?2 : 0

  return {
    score: Math.min(s1M+s3M+sVol, 20), max:20,
    detail: { r1M, r3M, rvol, s1M, s3M, sVol }
  }
}

/* ── Volatility scorer (15pts) ──────────────────── */
function scoreVolatility(ohlcv, fund) {
  const closes  = ohlcv?.map(d => d.price ?? d.close).filter(Boolean) ?? []
  const current = closes[closes.length-1] ?? 1
  const atr     = calcATR(ohlcv)
  const atrPct  = atr != null ? (atr / current) * 100 : null

  // Sweet spot for swing: 1.5–5% daily ATR
  let atrScore = 0
  if (atrPct != null) {
    if      (atrPct >= 1.5 && atrPct <= 5)  atrScore = 8  // ideal swing range
    else if (atrPct >= 0.8 && atrPct < 1.5) atrScore = 5  // low but ok
    else if (atrPct >  5   && atrPct <= 8)  atrScore = 4  // high, riskier
    else if (atrPct >  8)                    atrScore = 1  // too volatile
    else                                     atrScore = 3  // too quiet
  }

  // Beta score (sweet spot 0.8-1.8 for swing)
  const beta = fund?.beta ?? null
  let betaScore = 0
  if (beta != null) {
    if      (beta >= 0.8 && beta <= 1.8) betaScore = 7  // ideal
    else if (beta >  1.8 && beta <= 2.5) betaScore = 4  // high
    else if (beta <  0.8)                betaScore = 3  // too stable
    else                                 betaScore = 1  // too volatile
  }

  return {
    score: Math.min(atrScore+betaScore, 15), max:15,
    detail: { atr, atrPct, beta, atrScore, betaScore }
  }
}

/* ── Catalyst Strength scorer (15pts) ──────────── */
function scoreCatalysts(fund) {
  const f = fund ?? {}
  // Earnings beat streak
  const beatScore = Math.min((f.consecutiveBeats ?? 0) * 2, 6)
  // Revenue growth (recent only — different from LT engine)
  const revScore  = f.revenueGrowthYoY == null ? 0
    : f.revenueGrowthYoY > 20 ? 5 : f.revenueGrowthYoY > 10 ? 3 : f.revenueGrowthYoY > 0 ? 1 : 0
  // EPS momentum
  const epsScore  = f.epsGrowthYoY == null ? 0
    : f.epsGrowthYoY > 20 ? 4 : f.epsGrowthYoY > 10 ? 2 : f.epsGrowthYoY > 0 ? 1 : 0

  return {
    score: Math.min(beatScore+revScore+epsScore, 15), max:15,
    detail: { beatScore, revScore, epsScore, consecutiveBeats: f.consecutiveBeats ?? 0 }
  }
}

/* ── Quality (light) scorer (10pts) ─────────────── */
function scoreQuality(fund) {
  const f    = fund ?? {}
  const best = Math.max(f.roe??-Infinity, f.roic??-Infinity, f.roi??-Infinity)
  const roeS = isFinite(best) ? (best>20?5 : best>=12?3 : best>=8?1 : 0) : 0
  const nmS  = f.netMargin==null?0 : f.netMargin>15?5 : f.netMargin>=8?3 : f.netMargin>=0?1 : 0
  return { score: Math.min(roeS+nmS, 10), max:10, detail:{ roeS, nmS } }
}

/* ── Risk (swing-specific, -5pts max) ────────────── */
function scoreRisk(fund) {
  const f=fund??{}; let pen=0; const flags=[]
  if ((f.beta??0)>2.5) { pen-=3; flags.push('too_volatile') }
  if ((f.netMargin??0)<-15) { pen-=2; flags.push('negative_margin') }
  return { penalty: Math.max(pen,-5), flags }
}

/* ── Setup detection ─────────────────────────────── */
function detectSetup(tech, mom) {
  const { e20, e50, e200, current, rsi } = tech.detail ?? {}
  const { r1M, r3M, rvol } = mom.detail ?? {}

  if (!e20 || !e50 || !e200) return 'Insufficient Data'

  const aboveAll = current > e20 && current > e50 && current > e200
  const below20  = current < e20
  const emaOrdered = e20 > e50 && e50 > e200

  if (aboveAll && emaOrdered && rvol > 1.5) return 'Breakout'
  if (aboveAll && emaOrdered && r1M < 5)    return 'Trend Continuation'
  if (aboveAll && !emaOrdered)               return 'Recovery'
  if (below20 && current > e50)             return 'Pullback'
  if (current < e50 && current < e200)      return 'Distribution'
  if (Math.abs(r1M ?? 0) < 3)              return 'Range / Consolidation'
  return 'Mixed'
}

/* ── ATR-based trade levels ───────────────────────── */
function calcLevels(ohlcv) {
  const closes  = ohlcv?.map(d => d.price ?? d.close).filter(Boolean) ?? []
  const current = closes[closes.length-1]
  const atr     = calcATR(ohlcv) ?? (current * 0.02)
  return {
    entry:     current,
    stopLoss:  +(current - 2 * atr).toFixed(2),
    takeProfit:+(current + 3 * atr).toFixed(2),
    atr:       +atr.toFixed(2),
    riskReward: 1.5,
    atrPct:    +((atr / current) * 100).toFixed(2),
  }
}

/* ── Grades ──────────────────────────────────────── */
const SWING_GRADES = [
  { min:80, label:'STRONG BUY',  color:'#22C55E' },
  { min:65, label:'BUY',         color:'#86EFAC' },
  { min:50, label:'HOLD',        color:'#FBBF24' },
  { min:35, label:'SELL',        color:'#F97316' },
  { min:0,  label:'STRONG SELL', color:'#EF4444' },
]
export function getSwingGrade(score) {
  return SWING_GRADES.find(g => score >= g.min) ?? SWING_GRADES[SWING_GRADES.length-1]
}

/* ── Main entry ──────────────────────────────────── */
export function runSwingConviction(fund, ohlcv, spyOhlcv) {
  const tech = scoreTechnical(ohlcv, spyOhlcv)
  const mom  = scoreMomentum(ohlcv)
  const vol  = scoreVolatility(ohlcv, fund)
  const cats = scoreCatalysts(fund)
  const qual = scoreQuality(fund)
  const risk = scoreRisk(fund)

  const raw   = (tech.score??0)+(mom.score??0)+(vol.score??0)+(cats.score??0)+(qual.score??0)
  const final = Math.max(0, Math.min(100, Math.round(raw + risk.penalty)))
  const g     = getSwingGrade(final)
  const setup = detectSetup(tech, mom)
  const levels = calcLevels(ohlcv)

  const d = tech.detail ?? {}
  return {
    mode: 'swing', finalScore: final, rawScore: Math.round(raw),
    grade: g.label, gradeColor: g.color,
    riskPenalty: risk.penalty,
    setup,
    levels,
    breakdown: { technical: tech, momentum: mom, volatility: vol, catalysts: cats, quality: qual, risk },
    technical: {
      ema20: d.e20, ema50: d.e50, ema200: d.e200,
      above20: d.e20 && d.current > d.e20,
      above50: d.e50 && d.current > d.e50,
      above200:d.e200&& d.current > d.e200,
      emaOrdered: d.e20 > d.e50 && d.e50 > d.e200,
      rsi: d.rsi, rs1M: d.rs1M, rs3M: d.rs3M,
      macdBullish: d.macd?.line > 0,
      macdCross:   d.macd?.bullCross,
      rvol: mom.detail?.rvol,
      atr:  vol.detail?.atr,
      atrPct: vol.detail?.atrPct,
    },
    sectorProfile: 'SWING',
    modelVersion:  'TradePoint-Swing-v2.0',
    confidence:    fund ? 82 : 40,
    activeGate:    null,
    wallStreet:    { upside: null, analysts: 0 },
  }
}
