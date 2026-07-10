/**
 * MODULE: conviction/swing/engine.js
 * Swing Trading Conviction Score (1-day to 4-week horizon)
 * 
 * Weight philosophy — technical momentum dominates:
 *   Technical: 40pts (EMA20/50/200, MACD, RSI, RS vs SPY)
 *   Momentum:  20pts (1M/3M price return, relative volume)
 *   Growth:    20pts (Revenue YoY, EPS YoY, earnings beats)
 *   Quality:   10pts (ROE, Net Margin — lighter weight)
 *   Risk:      -5pts max
 */

/* ── Math helpers ──────────────────────────────────── */
function calcEMA(prices, period) {
  if (!prices?.length || prices.length < period) return null
  const k = 2 / (period + 1)
  let val = prices.slice(0, period).reduce((a,b) => a+b, 0) / period
  for (let i = period; i < prices.length; i++) val = prices[i]*k + val*(1-k)
  return val
}

function calcMACD(closes) {
  if (!closes?.length || closes.length < 35) return null
  const line = (calcEMA(closes,12) ?? 0) - (calcEMA(closes,26) ?? 0)
  return { line, aboveZero: line > 0 }
}

function calcRSI(closes, period=14) {
  if (closes.length < period+1) return null
  const sl = closes.slice(-(period+1))
  let g=0, l=0
  for (let i=1; i<sl.length; i++) { const d=sl[i]-sl[i-1]; d>0?g+=d:l-=d }
  const rs = l===0 ? 100 : (g/period)/(l/period)
  return 100 - (100/(1+rs))
}

function priceReturn(ohlcv, days) {
  if (!ohlcv?.length || ohlcv.length < days+1) return null
  const now  = ohlcv[ohlcv.length-1]?.price  ?? ohlcv[ohlcv.length-1]?.close
  const then = ohlcv[ohlcv.length-1-days]?.price ?? ohlcv[ohlcv.length-1-days]?.close
  return now && then ? ((now/then)-1)*100 : null
}

function relVol(ohlcv) {
  if (!ohlcv?.length || ohlcv.length < 21) return null
  const recent = ohlcv[ohlcv.length-1]?.volume ?? 0
  const avg = ohlcv.slice(-21,-1).reduce((s,d) => s+(d.volume??0),0) / 20
  return avg > 0 ? recent/avg : null
}

/* ── Scorers ─────────────────────────────────────── */
function scoreTechnical(ohlcv, spyOhlcv) {
  if (!ohlcv?.length) return { score: null, max: 40 }
  const closes  = ohlcv.map(d => d.price ?? d.close).filter(Boolean)
  const current = closes[closes.length-1]

  const e20  = calcEMA(closes, 20)
  const e50  = calcEMA(closes, 50)
  const e200 = calcEMA(closes, 200)
  const ab20 = e20  && current > e20  ? 5 : 0
  const ab50 = e50  && current > e50  ? 5 : 0
  const ab200= e200 && current > e200 ? 5 : 0

  const rsi = calcRSI(closes)
  const rsiSc = rsi==null?0 : rsi>=55&&rsi<=70?5 : rsi>=45&&rsi<55?3 : rsi>70&&rsi<=80?2 : 0

  const m = calcMACD(closes)
  const macdSc = m?.aboveZero ? 5 : m?.line!=null&&m.line>-0.5 ? 2 : 0

  const r1M    = priceReturn(ohlcv, 21);  const spy1M = priceReturn(spyOhlcv, 21)
  const r3M    = priceReturn(ohlcv, 63);  const spy3M = priceReturn(spyOhlcv, 63)
  const rs1M   = r1M!=null&&spy1M!=null ? r1M-spy1M : null
  const rs3M   = r3M!=null&&spy3M!=null ? r3M-spy3M : null
  const rs1Sc  = rs1M==null?0 : rs1M>5?5 : rs1M>0?3 : rs1M>-5?1 : 0
  const rs3Sc  = rs3M==null?0 : rs3M>5?5 : rs3M>0?3 : rs3M>-5?1 : 0

  return {
    score: Math.min(ab20+ab50+ab200+rsiSc+macdSc+rs1Sc+rs3Sc, 40), max:40,
    detail:{ ab20,ab50,ab200,rsiSc,macdSc,rs1Sc,rs3Sc,rsi,e20,e50,e200,rs1M,rs3M,current }
  }
}

function scoreMomentum(ohlcv, spyOhlcv) {
  const r1M  = priceReturn(ohlcv, 21)
  const r3M  = priceReturn(ohlcv, 63)
  const rv   = relVol(ohlcv)
  const abs1 = r1M==null?0 : r1M>15?7 : r1M>8?5 : r1M>3?3 : r1M>0?2 : 0
  const abs3 = r3M==null?0 : r3M>20?7 : r3M>10?5 : r3M>5?3 : r3M>0?2 : 0
  const volS = rv==null?0 : rv>1.5?6 : rv>1.1?4 : rv>0.8?2 : 0
  return { score: Math.min(abs1+abs3+volS,20), max:20, detail:{r1M,r3M,rv,abs1,abs3,volS} }
}

function scoreGrowth(fund) {
  const f = fund ?? {}
  const s = v => v==null?0 : v>25?8:v>=15?6:v>=10?4:v>=0?2:0
  const rev = s(f.revenueGrowthYoY), eps = s(f.epsGrowthYoY)
  const beats = Math.min((f.consecutiveBeats??0)*1,4)
  return { score: Math.min(rev+eps+beats,20), max:20, detail:{rev,eps,beats} }
}

function scoreQuality(fund) {
  const f = fund ?? {}
  const best = Math.max(f.roe??-Infinity, f.roic??-Infinity, f.roi??-Infinity)
  const roeSc = isFinite(best) ? (best>20?5:best>=12?3:best>=8?1:0) : 0
  const nmSc  = f.netMargin==null?0 : f.netMargin>15?5:f.netMargin>=8?3:f.netMargin>=0?1:0
  return { score: Math.min(roeSc+nmSc,10), max:10, detail:{roeSc,nmSc} }
}

function scoreRisk(fund) {
  const f = fund ?? {}; let pen=0; const flags=[]
  if ((f.beta??0)>2.5) { pen-=3; flags.push('very_high_beta') }
  else if ((f.beta??0)>2.0) { pen-=1; flags.push('high_beta') }
  if ((f.netMargin??0)<-15) { pen-=2; flags.push('negative_margin') }
  return { penalty: Math.max(pen,-5), flags }
}

/* ── Grades ──────────────────────────────────────── */
const GRADES = [
  {min:80,label:'STRONG BUY', color:'#22C55E'},
  {min:65,label:'BUY',        color:'#86EFAC'},
  {min:50,label:'HOLD',       color:'#FBBF24'},
  {min:35,label:'SELL',       color:'#F97316'},
  {min:0, label:'STRONG SELL',color:'#EF4444'},
]

export function getSwingGrade(score) {
  return GRADES.find(g => score >= g.min) ?? GRADES[GRADES.length-1]
}

/* ── Main entry ──────────────────────────────────── */
export function runSwingConviction(fund, ohlcv, spyOhlcv) {
  const tech = scoreTechnical(ohlcv, spyOhlcv)
  const mom  = scoreMomentum(ohlcv, spyOhlcv)
  const grow = scoreGrowth(fund)
  const qual = scoreQuality(fund)
  const risk = scoreRisk(fund)

  const raw   = (tech.score??0)+(mom.score??0)+(grow.score??0)+(qual.score??0)
  const final = Math.max(0, Math.min(100, Math.round(raw + risk.penalty)))
  const g     = getSwingGrade(final)

  return {
    mode: 'swing', finalScore: final, rawScore: Math.round(raw),
    grade: g.label, gradeColor: g.color,
    riskPenalty: risk.penalty,
    breakdown: { technical: tech, momentum: mom, growth: grow, quality: qual, risk },
    technical: {
      ema20:    tech.detail.e20,
      ema50:    tech.detail.e50,
      ema200:   tech.detail.e200,
      above20:  tech.detail.ab20 > 0,
      above50:  tech.detail.ab50 > 0,
      above200: tech.detail.ab200 > 0,
      rsi:      tech.detail.rsi,
      rs1M:     tech.detail.rs1M,
      rs3M:     tech.detail.rs3M,
    },
    sectorProfile: 'SWING',
    modelVersion:  'TradePoint-Swing-v1.0',
    confidence:    fund ? 80 : 35,
    activeGate:    null,
    wallStreet:    { upside: null, analysts: 0 },
  }
}
