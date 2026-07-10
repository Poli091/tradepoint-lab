/**
 * MODULE: conviction/swing/engine.js  v3.0
 * Swing Trading Conviction Score (2–8 week horizon)
 *
 * Weight structure:
 *   EMA Structure:         20pts  (stack alignment + overextension penalty)
 *   Relative Strength SPY: 15pts  (1M + 3M RS)
 *   MACD Quality:          10pts  (line, histogram, crossover)
 *   Relative Volume:       10pts  (RVOL vs 20-day avg)
 *   ADX / Trend Quality:   10pts  (trend strength, not direction)
 *   ATR Quality (pctile):  10pts  (compared to own 1Y history)
 *   Business Momentum:     10pts  (revenue/EPS acceleration + beats)
 *   Setup Bonus:            5pts  (combination alignment, not double-counting)
 *   Earnings Catalyst:      5pts  (proximity + beat streak)
 *   Risk:                  -5pts  max
 *
 * Grades: 80+ STRONG BUY · 65+ BUY · 50+ HOLD · 35+ SELL · 0+ STRONG SELL
 */

/* ── Math helpers ──────────────────────────────────── */
function calcEMA(prices, period) {
  if (!prices?.length || prices.length < period) return null
  const k = 2 / (period + 1)
  let v = prices.slice(0, period).reduce((a,b) => a+b, 0) / period
  for (let i = period; i < prices.length; i++) v = prices[i]*k + v*(1-k)
  return v
}

function calcRSI(closes, period=14) {
  if (!closes?.length || closes.length < period+1) return null
  const sl=closes.slice(-(period+1)); let gain=0,loss=0
  for (let i=1;i<sl.length;i++){const d=sl[i]-sl[i-1];d>0?gain+=d:loss-=d}
  return loss===0?100:100-(100/(1+(gain/period)/(loss/period)))
}

function calcATR(ohlcv, period=14) {
  if (!ohlcv?.length || ohlcv.length < period+1) return null
  const sl=ohlcv.slice(-(period+1)); let sum=0
  for (let i=1;i<sl.length;i++){
    const hi=sl[i].high??sl[i].price, lo=sl[i].low??sl[i].price, pc=sl[i-1].close??sl[i-1].price
    sum+=Math.max(hi-lo,Math.abs(hi-pc),Math.abs(lo-pc))
  }
  return sum/period
}

/* ATR Percentile — compare current ATR to full 1Y ATR history */
function calcATRPercentile(ohlcv, period=14) {
  if (!ohlcv?.length || ohlcv.length < period*2+1) return null
  const currentATR = calcATR(ohlcv, period)
  if (currentATR == null) return null
  // Rolling ATR over the full dataset
  const atrs = []
  for (let i = period; i < ohlcv.length - period; i++) {
    const slice = ohlcv.slice(i-period, i+1)
    const a = calcATR(slice, period)
    if (a != null) atrs.push(a)
  }
  if (!atrs.length) return null
  atrs.sort((a,b) => a-b)
  const rank = atrs.filter(a => a <= currentATR).length
  return Math.round((rank / atrs.length) * 100)
}

/* ADX — Average Directional Index (trend strength, not direction) */
function calcADX(ohlcv, period=14) {
  if (!ohlcv?.length || ohlcv.length < period*2+1) return null
  const sl = ohlcv.slice(-(period*2+1))
  const trs=[], plusDMs=[], minusDMs=[]
  for (let i=1;i<sl.length;i++){
    const hi=sl[i].high??sl[i].price, lo=sl[i].low??sl[i].price
    const phi=sl[i-1].high??sl[i-1].price, plo=sl[i-1].low??sl[i-1].price, pc=sl[i-1].close??sl[i-1].price
    trs.push(Math.max(hi-lo,Math.abs(hi-pc),Math.abs(lo-pc)))
    const upMove=hi-phi, downMove=plo-lo
    plusDMs.push(upMove>downMove&&upMove>0?upMove:0)
    minusDMs.push(downMove>upMove&&downMove>0?downMove:0)
  }
  const avgTR = trs.slice(-period).reduce((a,b)=>a+b,0)/period
  const avgPDM = plusDMs.slice(-period).reduce((a,b)=>a+b,0)/period
  const avgMDM = minusDMs.slice(-period).reduce((a,b)=>a+b,0)/period
  if (!avgTR) return null
  const diP=(avgPDM/avgTR)*100, diM=(avgMDM/avgTR)*100
  const dx = diP+diM>0 ? (Math.abs(diP-diM)/(diP+diM))*100 : 0
  return { adx:Math.round(dx), diPlus:Math.round(diP), diMinus:Math.round(diM) }
}

function priceReturn(ohlcv, days) {
  if (!ohlcv?.length||ohlcv.length<days+1) return null
  const now=ohlcv[ohlcv.length-1]?.price??ohlcv[ohlcv.length-1]?.close
  const then=ohlcv[ohlcv.length-1-days]?.price??ohlcv[ohlcv.length-1-days]?.close
  return now&&then?((now/then)-1)*100:null
}

function calcRVOL(ohlcv, days=20) {
  if (!ohlcv?.length||ohlcv.length<days+1) return null
  const recent=ohlcv[ohlcv.length-1]?.volume??0
  const avg=ohlcv.slice(-days-1,-1).reduce((s,d)=>s+(d.volume??0),0)/days
  return avg>0?recent/avg:null
}

function donchianBreakout(ohlcv, period=20) {
  if (!ohlcv?.length||ohlcv.length<period+1) return false
  const current=ohlcv[ohlcv.length-1]?.price??ohlcv[ohlcv.length-1]?.close
  const highs=ohlcv.slice(-period-1,-1).map(d=>d.high??d.price).filter(Boolean)
  return highs.length>0 && current>=Math.max(...highs)
}

/* ── EMA Structure scorer (20pts) ─────────────────── */
function scoreEMAStructure(ohlcv) {
  if (!ohlcv?.length) return {score:0,max:20,detail:{}}
  const closes=ohlcv.map(d=>d.price??d.close).filter(Boolean)
  const current=closes[closes.length-1]
  const e20=calcEMA(closes,20), e50=calcEMA(closes,50), e200=calcEMA(closes,200)
  if (!e20) return {score:0,max:20,detail:{}}

  // Cascading alignment (not simple sum)
  let score=0
  const a20=current>e20, a50=e50&&current>e50, a200=e200&&current>e200
  const ordered=e20&&e50&&e200&&e20>e50&&e50>e200

  if (a200&&a50&&a20&&ordered) score=20      // perfect bull stack
  else if (a50&&a20&&e20&&e50&&e20>e50) score=15  // above 20+50, ordered
  else if (a50&&a20) score=12                 // above 20+50, unordered
  else if (a20&&!a50) score=8                 // above 20 only
  else if (!a20&&a50) score=4                 // below 20, above 50 (possible pullback entry)
  else score=0

  // Overextension penalty (price >12% above EMA20 = stretched)
  const distFromEMA20 = e20 ? ((current/e20)-1)*100 : 0
  if (distFromEMA20 > 12) score = Math.max(0, score-4)

  return {score:Math.min(score,20),max:20,
    detail:{e20,e50,e200,current,a20,a50,a200,ordered,distFromEMA20}}
}

/* ── Relative Strength vs SPY (15pts) ─────────────── */
function scoreRS(ohlcv, spyOhlcv) {
  const r1M=priceReturn(ohlcv,21), s1M=priceReturn(spyOhlcv,21)
  const r3M=priceReturn(ohlcv,63), s3M=priceReturn(spyOhlcv,63)
  const rs1M=r1M!=null&&s1M!=null?r1M-s1M:null
  const rs3M=r3M!=null&&s3M!=null?r3M-s3M:null
  const sc1=rs1M==null?0:rs1M>8?8:rs1M>4?6:rs1M>0?4:rs1M>-4?2:0
  const sc3=rs3M==null?0:rs3M>8?7:rs3M>4?5:rs3M>0?3:rs3M>-4?1:0
  return {score:Math.min(sc1+sc3,15),max:15,detail:{rs1M,rs3M}}
}

/* ── MACD Quality (10pts) ─────────────────────────── */
function scoreMACD(ohlcv) {
  const closes=ohlcv?.map(d=>d.price??d.close).filter(Boolean)??[]
  if (closes.length<35) return {score:0,max:10,detail:{}}
  const ema12=calcEMA(closes,12), ema26=calcEMA(closes,26)
  if (!ema12||!ema26) return {score:0,max:10,detail:{}}
  const line=ema12-ema26
  const prev12=calcEMA(closes.slice(0,-1),12), prev26=calcEMA(closes.slice(0,-1),26)
  const prevLine=(prev12??0)-(prev26??0)
  const bullCross=prevLine<0&&line>0
  let score=0
  if (line>0)           score+=4  // above zero
  if (line>prevLine)    score+=4  // histogram expanding
  if (bullCross)        score+=2  // fresh crossover bonus
  return {score:Math.min(score,10),max:10,detail:{line,prevLine,bullCross}}
}

/* ── RVOL (10pts) ─────────────────────────────────── */
function scoreRVOL(ohlcv) {
  const rv=calcRVOL(ohlcv)
  const score=rv==null?0:rv>=2.5?10:rv>=2?8:rv>=1.5?6:rv>=1.1?4:rv>=0.8?2:0
  return {score,max:10,detail:{rvol:rv}}
}

/* ── ADX / Trend Quality (10pts) ─────────────────── */
function scoreADX(ohlcv) {
  const adxData=calcADX(ohlcv)
  if (!adxData) return {score:0,max:10,detail:{}}
  const {adx,diPlus,diMinus}=adxData
  // Strong trend + bullish direction
  let score=0
  if (adx>=25)      score+=6  // trending
  else if (adx>=18) score+=3  // mild trend
  if (diPlus>diMinus) score+=4  // bullish direction
  else if (diPlus>diMinus*0.8) score+=1  // nearly balanced
  return {score:Math.min(score,10),max:10,detail:{adx,diPlus,diMinus}}
}

/* ── ATR Quality — percentile-based (10pts) ──────── */
function scoreATRQuality(ohlcv) {
  const pctile=calcATRPercentile(ohlcv)
  if (pctile==null) return {score:0,max:10,detail:{}}
  // Sweet spot: 30th-70th percentile = normal volatility for this stock
  let score=0
  if (pctile>=30&&pctile<=70)    score=10  // normal range for this ticker
  else if (pctile>=20&&pctile<30) score=7  // slightly below normal
  else if (pctile>70&&pctile<=80) score=6  // slightly elevated
  else if (pctile>80&&pctile<=90) score=3  // elevated
  else if (pctile<20)              score=4  // unusually quiet
  else                             score=1  // very elevated (>90th pctile)
  return {score,max:10,detail:{atrPctile:pctile}}
}

/* ── Business Momentum (10pts) ───────────────────── */
function scoreBusinessMomentum(fund) {
  const f=fund??{}
  // Revenue acceleration (not absolute level, acceleration)
  const revSc=f.revenueGrowthYoY==null?0
    :f.revenueGrowthYoY>30?4:f.revenueGrowthYoY>15?3:f.revenueGrowthYoY>5?2:f.revenueGrowthYoY>0?1:0
  const epsSc=f.epsGrowthYoY==null?0
    :f.epsGrowthYoY>30?4:f.epsGrowthYoY>15?3:f.epsGrowthYoY>5?2:f.epsGrowthYoY>0?1:0
  const beatSc=Math.min((f.consecutiveBeats??0),2)
  return {score:Math.min(revSc+epsSc+beatSc,10),max:10,detail:{revSc,epsSc,beatSc}}
}

/* ── Earnings Catalyst (5pts) ────────────────────── */
function scoreEarnings(fund) {
  const beats=fund?.consecutiveBeats??0
  const score=beats>=4?5:beats>=3?4:beats>=2?3:beats>=1?2:0
  return {score,max:5,detail:{consecutiveBeats:beats}}
}


/* ── Setup confidence (0-100%) ────────────────────── */
function setupConfidence(setup, emaD, adxD, macdD, rvolD) {
  const conditions = {
    'Breakout': [
      emaD?.ordered, emaD?.a20&&emaD?.a50&&emaD?.a200,
      adxD?.adx>=20, macdD?.line>0,
      rvolD?.rvol>=1.5, macdD?.bullCross,
    ],
    'Trend Continuation': [
      emaD?.ordered, adxD?.adx>=20, macdD?.line>0,
      (adxD?.diPlus??0)>(adxD?.diMinus??0), emaD?.a20,
    ],
    'Pullback': [
      emaD?.a50&&emaD?.a200, !emaD?.a20,
      adxD?.adx>=15, (adxD?.diPlus??0)>(adxD?.diMinus??0),
    ],
    'Recovery': [emaD?.a20, !emaD?.a50, rvolD?.rvol>=1.2, macdD?.line>0],
    'Range':    [adxD?.adx<18, !emaD?.ordered],
    'Distribution': [!emaD?.a200, !emaD?.a50, (adxD?.diMinus??0)>(adxD?.diPlus??0)],
  }
  const conds = conditions[setup] ?? []
  if (!conds.length) return 50
  const met = conds.filter(Boolean).length
  return Math.round((met / conds.length) * 100)
}

/* ── Setup reasons (bullet points) ────────────────── */
function setupReasons(setup, emaD, adxD, macdD, rvolD, rsD) {
  const reasons = []
  const d=emaD??{}, a=adxD??{}, m=macdD??{}, r=rvolD??{}, rs=rsD??{}

  if (d.ordered)              reasons.push('EMA stack bullish (20>50>200)')
  if (d.a20&&!d.ordered)      reasons.push(`Price above EMA20 ($${d.e20?.toFixed(0)??'—'})`)
  if (d.a50)                  reasons.push(`Price above EMA50 ($${d.e50?.toFixed(0)??'—'})`)
  if (d.a200)                 reasons.push(`Price above EMA200 ($${d.e200?.toFixed(0)??'—'})`)
  if (m.bullCross)            reasons.push('MACD fresh bullish crossover')
  if (m.line>0&&!m.bullCross) reasons.push('MACD above zero')
  if ((a.adx??0)>=25)         reasons.push(`ADX ${a.adx} — strong trend`)
  else if((a.adx??0)>=18)     reasons.push(`ADX ${a.adx} — mild trend`)
  else if((a.adx??0)<18)      reasons.push(`ADX ${a.adx} — range/weak trend`)
  if ((a.diPlus??0)>(a.diMinus??0)) reasons.push(`DI+ ${a.diPlus} > DI− ${a.diMinus} (bull direction)`)
  if ((r.rvol??0)>=2)         reasons.push(`RVOL ${r.rvol?.toFixed(1)}x — strong volume`)
  else if((r.rvol??0)>=1.5)   reasons.push(`RVOL ${r.rvol?.toFixed(1)}x — above average`)
  if ((rs.rs1M??0)>0)         reasons.push(`Outperforming SPY 1M (+${rs.rs1M?.toFixed(1)}%)`)
  if (d.distFromEMA20>12)     reasons.push(`⚠ ${d.distFromEMA20?.toFixed(1)}% above EMA20 — extended`)

  return reasons.slice(0, 5)  // max 5 bullets
}

/* ── Momentum Exhaustion detection ────────────────── */
function detectExhaustion(emaD, rsiVal, rvolD) {
  const signals = []
  if ((rsiVal??0)>78)                    signals.push(`RSI ${rsiVal?.toFixed(0)} — overbought`)
  if ((emaD?.distFromEMA20??0)>12)       signals.push(`Price ${emaD?.distFromEMA20?.toFixed(1)}% above EMA20`)
  if ((rvolD?.rvol??1)<0.8&&(rsiVal??0)>65) signals.push('Volume declining on rally')
  const exhausted = signals.length >= 2
  return { exhausted, signals, warning: exhausted ? '⚠ Momentum may be exhausted' : null }
}

/* ── Setup Detection ─────────────────────────────── */
function detectSetup(emaD, adxD, macdD, rvolD, ohlcv) {
  const {a20,a50,a200,ordered,distFromEMA20,current,e20}=emaD
  const adx=adxD?.adx??0, diP=adxD?.diPlus??0, diM=adxD?.diMinus??0
  const rv=rvolD?.rvol??0
  const macdBull=macdD?.line>0
  const breakout20=donchianBreakout(ohlcv,20)

  if (a20&&a50&&a200&&ordered&&breakout20&&rv>1.5) return 'Breakout'
  if (a20&&a50&&a200&&ordered&&macdBull&&adx>=20)  return 'Trend Continuation'
  if (a50&&a200&&!a20&&distFromEMA20>-8)           return 'Pullback'
  if (!a50&&a20&&rv>1.2)                            return 'Recovery'
  if (!a20&&!a50&&adx<18)                           return 'Range'
  if (!a200&&!a50&&diM>diP)                         return 'Distribution'
  return 'Mixed'
}

/* ── Setup Alignment Bonus (5pts max — rewards combination, not individual indicators) ── */
function scoreSetupBonus(setup, emaD, rvolD, macdD) {
  // Small bonus for when ALL key conditions align cleanly
  // Not double-counting: rewards the COMBINATION being right together
  const rv=rvolD?.rvol??0, macdBull=macdD?.line>0, ordered=emaD?.ordered
  switch(setup) {
    case 'Breakout':           return ordered&&rv>2&&macdBull?5:ordered&&rv>1.5?3:1
    case 'Trend Continuation': return ordered&&macdBull?4:ordered?2:1
    case 'Pullback':           return macdBull&&rv>1?3:2
    case 'Recovery':           return rv>1.5?3:2
    case 'Range':              return 1
    case 'Distribution':       return 0
    default:                   return 1
  }
}

/* ── Setup-dependent SL/TP ───────────────────────── */
function calcLevels(ohlcv, setup) {
  const closes=ohlcv?.map(d=>d.price??d.close).filter(Boolean)??[]
  const current=closes[closes.length-1]
  const atrVal=calcATR(ohlcv)??current*0.02
  const configs={
    'Breakout':          {sl:2.0,tp:3.5,note:'Wide SL for breakout room'},
    'Trend Continuation':{sl:1.5,tp:2.5,note:'Tight SL in established trend'},
    'Pullback':          {sl:1.0,tp:2.0,note:'Tight SL near support'},
    'Recovery':          {sl:2.5,tp:3.5,note:'Wider SL for early recovery'},
    'Range':             {sl:1.5,tp:1.5,note:'Limited upside in range'},
    'Mixed':             {sl:2.0,tp:3.0,note:'Standard setup'},
    'Distribution':      {sl:1.5,tp:1.5,note:'Low conviction'},
  }
  const cfg=configs[setup]??configs['Mixed']
  return {
    entry: +current.toFixed(2),
    stopLoss: +(current-cfg.sl*atrVal).toFixed(2),
    takeProfit: +(current+cfg.tp*atrVal).toFixed(2),
    atr: +atrVal.toFixed(2),
    atrPct: +((atrVal/current)*100).toFixed(2),
    slMultiple: cfg.sl, tpMultiple: cfg.tp,
    riskReward: +(cfg.tp/cfg.sl).toFixed(2),
    note: cfg.note,
  }
}

/* ── Risk (swing-specific) ───────────────────────── */
function scoreRisk(fund) {
  const f=fund??{}; let pen=0; const flags=[]
  if ((f.netMargin??0)<-15){pen-=3;flags.push('negative_margin')}
  if ((f.debtToEquity??0)>5){pen-=2;flags.push('high_leverage')}
  return {penalty:Math.max(pen,-5),flags}
}

/* ── Grades ──────────────────────────────────────── */
const SWING_GRADES=[
  {min:80,label:'STRONG BUY', color:'#22C55E'},
  {min:65,label:'BUY',        color:'#86EFAC'},
  {min:50,label:'HOLD',       color:'#FBBF24'},
  {min:35,label:'SELL',       color:'#F97316'},
  {min:0, label:'STRONG SELL',color:'#EF4444'},
]
export function getSwingGrade(score){return SWING_GRADES.find(entry=>score>=entry.min)??SWING_GRADES[SWING_GRADES.length-1]}

/* ── Main entry ──────────────────────────────────── */
export function runSwingConviction(fund, ohlcv, spyOhlcv) {
  const ema   = scoreEMAStructure(ohlcv)
  const rs    = scoreRS(ohlcv, spyOhlcv)
  const mac   = scoreMACD(ohlcv)
  const rvol  = scoreRVOL(ohlcv)
  const adx   = scoreADX(ohlcv)
  const atrQ  = scoreATRQuality(ohlcv)
  const biz   = scoreBusinessMomentum(fund)
  const earn  = scoreEarnings(fund)
  const risk  = scoreRisk(fund)

  const setup      = detectSetup(ema.detail, adx.detail, mac.detail, rvol.detail, ohlcv)
  const setupConf  = setupConfidence(setup, ema.detail, adx.detail, mac.detail, rvol.detail)
  const setupWhy   = setupReasons(setup, ema.detail, adx.detail, mac.detail, rvol.detail, rs.detail)
  const setupB     = scoreSetupBonus(setup, ema.detail, rvol.detail, mac.detail)
  const levels     = calcLevels(ohlcv, setup)
  const rsiVal     = calcRSI((ohlcv??[]).map(x=>x.price??x.close).filter(Boolean))
  const exhaustion = detectExhaustion(ema.detail, rsiVal, rvol.detail)

  const raw   = ema.score+rs.score+mac.score+rvol.score+adx.score+atrQ.score+biz.score+setupB+earn.score
  const final = Math.max(0,Math.min(100,Math.round(raw+risk.penalty)))
  const grade = getSwingGrade(final)
  const d     = ema.detail

  return {
    mode:'swing', finalScore:final, rawScore:Math.round(raw),
    grade:g.label, gradeColor:g.color, riskPenalty:risk.penalty,
    setup, setupConfidence:setupConf, setupReasons:setupWhy,
    exhaustion, levels,
    breakdown:{ema,rs,macd:mac,rvol,adx,atrQuality:atrQ,businessMomentum:biz,setupBonus:{score:setupB,max:10},earnings:earn,risk},
    technical:{
      ema20:d.e20, ema50:d.e50, ema200:d.e200,
      above20:d.a20, above50:d.a50, above200:d.a200,
      emaOrdered:d.ordered, distFromEMA20:d.distFromEMA20,
      rsi:calcRSI((ohlcv??[]).map(x=>x.price??x.close).filter(Boolean)),
      rs1M:rs.detail.rs1M, rs3M:rs.detail.rs3M,
      macdBullish:mac.detail.line>0, macdCross:mac.detail.bullCross,
      adx:adx.detail.adx, diPlus:adx.detail.diPlus, diMinus:adx.detail.diMinus,
      rvol:rvol.detail.rvol,
      atrPctile:atrQ.detail.atrPctile, atr:levels.atr, atrPct:levels.atrPct,
    },
    sectorProfile:'SWING', modelVersion:'TradePoint-Swing-v3.0',
    confidence:fund?84:38, activeGate:null, wallStreet:{upside:null,analysts:0},
  }
}
