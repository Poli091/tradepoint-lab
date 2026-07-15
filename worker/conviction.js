/**
 * worker/conviction.js
 * Self-contained conviction engine for Cloudflare Workers.
 * Mirrors src/conviction/ exactly — no browser dependencies.
 * Used by the weekly Cron snapshot job.
 */

/* ════════════════════════════════════════════════════════════
   SECTOR PROFILES
════════════════════════════════════════════════════════════ */
const TICKER_OVERRIDES = {
  VST:'utilities', CEG:'utilities', NEE:'utilities',
  NRG:'utilities', ETR:'utilities', DUK:'utilities',
  SO:'utilities',  PCG:'utilities', OKLO:'utilities', SMR:'utilities',
}
const ETF_MAP = { XLU:'utilities', XLRE:'reit', XLF:'banks' }
const SECTOR_MAP = { Utilities:'utilities', 'Real Estate':'reit', Financials:'banks' }

const PROFILES = {
  default:   { name:'default',   gate1DebtMax:4,    riskDebtMax:3.0,
    debt:[[0.5,5],[1.0,4],[2.0,3],[4.0,1],[Infinity,0]],
    cr:  [[2.0,5],[1.5,4],[1.0,3],[0.8,1]],
    ic:  [[10,5],[5,4],[3,3],[1,1]] },
  utilities: { name:'utilities', gate1DebtMax:6,    riskDebtMax:5.0,
    debt:[[1.5,5],[2.5,4],[4.0,3],[6.0,1],[Infinity,0]],
    cr:  [[1.2,5],[1.0,4],[0.8,3],[0.6,1]],
    ic:  [[3.0,5],[2.0,4],[1.5,3],[1.0,1]] },
  reit:      { name:'reit',      gate1DebtMax:10,  gate2DebtMax:8,  riskDebtMax:8.0,
    debt:[[3.0,5],[5.0,4],[8.0,3],[10.0,1],[Infinity,0]],
    cr:  [[1.5,5],[1.0,4],[0.8,3],[0.5,1]],
    ic:  [[3.0,5],[2.0,4],[1.5,3],[1.0,1]] },
  banks:     { name:'banks',     gate1DebtMax:null, riskDebtMax:null,
    debt:null, cr:null, ic:null },
}

function getProfile(ticker, sector='', sectorEtf='') {
  return PROFILES[TICKER_OVERRIDES[ticker?.toUpperCase()]]
    ?? PROFILES[ETF_MAP[sectorEtf]]
    ?? PROFILES[SECTOR_MAP[sector]]
    ?? PROFILES.default
}

/* ════════════════════════════════════════════════════════════
   SCORING FUNCTIONS
════════════════════════════════════════════════════════════ */

function bracket(value, brackets, type='max') {
  if (value == null || !brackets) return null
  for (const [thresh, pts] of brackets) {
    if (type === 'max' && value <= thresh) return pts
    if (type === 'min' && value >= thresh) return pts
  }
  return 0
}

function normalize(components, totalMax) {
  let raw = 0, max = 0, nulls = 0
  for (const {score, weight} of components) {
    if (score == null) nulls++
    else { raw += score; max += weight }
  }
  return { score: max > 0 ? Math.round((raw/max)*totalMax*10)/10 : null, nullFields: nulls }
}

// Growth (25) — v1.1: winsorize + EPS anomaly + growth quality modifier
function scoreRevenue(v) {
  if (v==null) return null
  const w = Math.min(v, 60)  // cap at 60%
  return w>25?8 : w>=15?6 : w>=10?4 : w>=0?2 : 0
}
function scoreEPS(v) {
  if (v==null) return null
  if (v > 500) return 4  // anomalous base — neutral 4/8
  const w = Math.min(v, 80)  // cap at 80%
  return w>25?8 : w>=15?6 : w>=10?4 : w>=0?2 : 0
}
function scoreFCF(v) {
  if (v==null) return null
  const w = Math.min(v, 100)  // cap at 100%
  return w>20?5 : w>=10?3 : w>=0?2 : 0
}
function acceleration(f) {
  let pts=0, max=0
  if (f.revenueGrowthYoY!=null && f.revenueGrowth3Y!=null) {
    max+=2; const g=f.revenueGrowthYoY-f.revenueGrowth3Y
    pts += g>5?2 : g>-5?1 : 0
  }
  if (f.epsGrowthYoY!=null && f.epsGrowth3Y!=null && Math.abs(f.epsGrowthYoY)<=500) {
    max+=2; const g=f.epsGrowthYoY-f.epsGrowth3Y
    pts += g>5?2 : g>-5?1 : 0
  }
  if (max===0) return null
  return max<4 ? (pts/max)*4 : pts
}
// Growth Quality Modifier: penalizes high opExpenseBurden + low/negative opMargin
function growthModifier(f) {
  if (f.operatingMargin==null || f.grossMargin==null) return 1.0
  const burden = f.grossMargin - f.operatingMargin
  if (burden > 40 && f.operatingMargin < 0)  return 0.65
  if (burden > 30 && f.operatingMargin < 5)  return 0.85
  return 1.0
}

function growth(f) {
  const comps = [
    { score: scoreRevenue(f.revenueGrowthYoY), weight:8 },
    { score: scoreEPS(f.epsGrowthYoY),          weight:8, anomalous: f.epsGrowthYoY > 500, capped: f.epsGrowthYoY > 80 && f.epsGrowthYoY <= 500 },
    { score: scoreFCF(f.fcfGrowth5Y),            weight:5 },
    { score: acceleration(f),                    weight:4 },
  ]
  const base = normalize(comps, 25)
  const mod  = growthModifier(f)
  return { ...base, score: base.score != null ? Math.round(base.score * mod * 10) / 10 : null,
    growthQualityModifier: mod,
    components: { eps: { anomalous: f.epsGrowthYoY > 500, capped: f.epsGrowthYoY > 80 && f.epsGrowthYoY <= 500 } } }
}

// Quality (20) — v1.1: remove Net Margin (correlated), add FCF Margin, reduce double-count
// ROIC(7) + OperatingMargin(6) + GrossMargin(4) + FCFMargin(3) = 20
function quality(f) {
  const options = [f.roic, f.roi, f.roe].filter(v=>v!=null)
  const roicVal   = options.length>0 ? Math.max(...options) : null
  const roicScore = roicVal==null?null : roicVal>20?7 : roicVal>=15?6 : roicVal>=10?4 : roicVal>=8?2 : 0
  const opScore   = f.operatingMargin==null?null : f.operatingMargin>30?6 : f.operatingMargin>=20?5 : f.operatingMargin>=10?3 : f.operatingMargin>=0?1 : 0
  const gmScore   = f.grossMargin==null?null : f.grossMargin>60?4 : f.grossMargin>=40?3 : f.grossMargin>=20?2 : 0
  const fcfM      = f.fcfMarginTTM ?? null
  const fcfScore  = fcfM==null?null : fcfM>20?3 : fcfM>=10?2 : fcfM>=0?1 : 0
  return normalize([{score:roicScore,weight:7},{score:opScore,weight:6},{score:gmScore,weight:4},{score:fcfScore,weight:3}], 20)
}

// Strength (15) — v1.1: negative D/E = negative equity = 0 pts + flag
function strength(f, profile) {
  if (profile.name==='banks') return { score:null, nullFields:3, skipped:true }
  let deScore, negativeEquity = false
  if (f.debtToEquity == null) {
    deScore = null
  } else if (f.debtToEquity < 0) {
    deScore = 0; negativeEquity = true  // negative equity — cannot assume net cash
  } else {
    deScore = bracket(f.debtToEquity, profile.debt, 'max')
  }
  const cr = bracket(f.currentRatio,     profile.cr, 'min')
  const ic = bracket(f.interestCoverage, profile.ic, 'min')
  return { ...normalize([{score:deScore,weight:5},{score:cr,weight:5},{score:ic,weight:5}], 15), negativeEquity }
}

// Valuation (15) — cascade PEG → EV/FCF → EV/EBITDA → P/E
function pegScore(v)      { if(!v||v<=0)return null; return v<0.5?15:v<1?13:v<1.5?10:v<2?7:v<3?4:1 }
function evFcfScore(v)    { if(!v||v<=0)return null; return v<15?15:v<25?12:v<35?9:v<50?6:v<75?3:1 }
function evEbitdaScore(v) { if(!v||v<=0)return null; return v<10?15:v<15?12:v<20?9:v<25?6:v<35?3:1 }
function peScore(v)       { if(!v||v<=0)return null; return v<10?15:v<15?12:v<20?9:v<30?6:v<50?3:1 }

function valuation(f) {
  const strategies = [
    { metric:'PEG',      fn:pegScore,      val:f.peg      },
    { metric:'EV/FCF',   fn:evFcfScore,    val:f.evFcf    },
    { metric:'EV/EBITDA',fn:evEbitdaScore, val:f.evEbitda },
    { metric:'P/E',      fn:peScore,       val:f.pe       },
  ]
  for (const {metric, fn, val} of strategies) {
    const s = fn(val)
    if (s!=null) return { score:s, max:15, metric, value:val, nullFields:0 }
  }
  return { score:null, max:15, metric:null, value:null, nullFields:1 }
}

// Technical (15) — EMA(5) + RSI(3) + RS vs SPY(7)
function calcEMA(closes, period) {
  if (!closes || closes.length<period) return null
  const k = 2/(period+1)
  let ema = closes.slice(0,period).reduce((a,b)=>a+b,0)/period
  for (let i=period; i<closes.length; i++) ema = closes[i]*k+ema*(1-k)
  return ema
}

function calcRSI(closes, period=14) {
  if (!closes || closes.length<period+1) return null
  let gains=0, losses=0
  for (let i=1;i<=period;i++) {
    const d = closes[i]-closes[i-1]
    if (d>0) gains+=d; else losses-=d
  }
  let ag=gains/period, al=losses/period
  for (let i=period+1;i<closes.length;i++) {
    const d = closes[i]-closes[i-1]
    ag = (ag*(period-1)+(d>0?d:0))/period
    al = (al*(period-1)+(d<0?-d:0))/period
  }
  if (al===0) return 100
  return Math.round((100-100/(1+ag/al))*100)/100
}

function periodReturn(ohlcv, days) {
  if (!ohlcv||ohlcv.length<days) return null
  const slice = ohlcv.slice(-days)
  const first=slice[0]?.price, last=slice[slice.length-1]?.price
  if (!first||!last||first===0) return null
  return ((last-first)/first)*100
}

function technical(ohlcv, spyOhlcv, currentPrice) {
  const closes = (ohlcv||[]).map(d=>d.price)
  const period  = Math.min(200, closes.length)
  const p50     = Math.min(50,  closes.length)
  const ema200  = calcEMA(closes, period)
  const ema50   = p50 >= 10 ? calcEMA(closes, p50) : null
  const price   = currentPrice ?? closes[closes.length-1]
  const above   = ema200!=null && price!=null ? price>ema200 : null
  // Extension penalty: price > EMA50 + 2.5×ATR → -1 pt (avoid max technical on parabolic moves)
  let extended = false
  let emaScore = above==null ? null : above ? 5 : 0
  if (above && ema50 && price && closes.length >= 15) {
    const recent = closes.slice(-15)
    const atr = recent.slice(1).reduce((s,c,i) => s + Math.abs(c - recent[i]), 0) / (recent.length - 1)
    if (atr > 0 && (price - ema50) > 2.5 * atr) { emaScore = Math.max(0, (emaScore??0) - 1); extended = true }
  }

  const rsi      = calcRSI(closes)
  const rsiScore = rsi==null?null : (rsi>=40&&rsi<=60)?3 : (rsi>=30||rsi<=70)?2 : 1

  const PERIODS = [{days:21,w:1},{days:63,w:2},{days:126,w:1.5}]
  let totalW=0, wRS=0
  const rsBreakdown={}
  for (const {days,w,label} of PERIODS.map((p,i)=>({...p,label:['1M','3M','6M'][i]}))) {
    const tr=periodReturn(ohlcv,days), sr=periodReturn(spyOhlcv,days)
    if (tr!=null&&sr!=null) {
      const rs=tr-sr
      rsBreakdown[label]={rs:Math.round(rs*100)/100}
      wRS+=rs*w; totalW+=w
    }
  }
  const avgRS = totalW>0 ? Math.round((wRS/totalW)*100)/100 : null
  const rsScore = avgRS==null?null : avgRS>15?7:avgRS>10?6:avgRS>5?5:avgRS>0?4:avgRS>-5?2:avgRS>-10?1:0

  let nulls=0
  if (emaScore==null)nulls++; if(rsiScore==null)nulls++; if(rsScore==null)nulls++
  const comps=[{score:emaScore,weight:5},{score:rsiScore,weight:3},{score:rsScore,weight:7}]
  const {score} = normalize(comps, 15)

  return { score, nullFields:nulls, ema200:ema200?Math.round(ema200*100)/100:null,
    currentPrice:price, aboveEMA200:above, rsi, relStrengthWeighted:avgRS,
    extended, components:{ ema200:{ extended } } }
}

// Risk (10 — penalties only)
function risk(f, profile) {
  const flags=[], triggered=[]
  let total=0
  if (f.beta!=null&&f.beta>2) { flags.push('beta_high'); total-=2; triggered.push({flag:'beta_high',penalty:-2}) }
  if (f.netMargin!=null&&f.netMargin<-10) { flags.push('margin_negative'); total-=3; triggered.push({flag:'margin_negative',penalty:-3}) }
  const dmax=profile.riskDebtMax
  if (dmax!=null&&f.debtToEquity!=null&&f.debtToEquity>dmax) { flags.push('debt_extreme'); total-=3; triggered.push({flag:'debt_extreme',penalty:-3}) }
  return { penalty:Math.max(total,-10), flags, breakdown:triggered }
}

// Gates v1.1
function gates(f, profile) {
  // Gate 1
  const g1checks={}
  const revOk=(f.revenueGrowth3Y!=null&&f.revenueGrowth3Y>0)||(f.revenueGrowthYoY!=null&&f.revenueGrowthYoY>=0)||(f.revenueGrowth3Y==null&&f.revenueGrowthYoY==null)
  g1checks.revenueGrowth={pass:revOk}
  g1checks.operatingMargin={pass:f.operatingMargin==null||f.operatingMargin>-25}
  if (profile.name!=='banks'&&profile.gate1DebtMax!=null) {
    g1checks.debtEquity={pass:f.debtToEquity==null||f.debtToEquity<=profile.gate1DebtMax}
  } else { g1checks.debtEquity={pass:true,skipped:true} }
  const g1pass=Object.values(g1checks).every(c=>c.pass)
  if (!g1pass) return { gate1:{pass:false,checks:g1checks}, gate2:{pass:false,skipped:true}, activeCap:35, activeGate:'gate1' }

  // Gate 2 — v1.1: ROIC only (not ROI); ROE with leverage guard; sector substitutes
  const g2checks={}
  const roic = f.roic ?? null   // ROIC only — ROI excluded (ambiguous definition)
  const roe  = f.roe  ?? null
  const de   = f.debtToEquity ?? null
  const debtThreshold = profile.gate1DebtMax ?? 4
  let profPass, profSource, gate2Evaluable = false
  if (roic != null) {
    gate2Evaluable = true
    profPass = roic >= 8; profSource = 'roic'
  } else if (roe != null) {
    gate2Evaluable = true
    const negEq   = de != null && de < 0
    const levOk   = !negEq && (de == null || de <= debtThreshold)
    profPass      = roe >= 10 && levOk
    profSource    = levOk ? 'roe_leverage_ok' : 'roe_failed_leverage_check'
  } else {
    // No ROIC or ROE — not evaluable; ROI excluded (ambiguous); pass by null policy
    profPass = true; profSource = null; gate2Evaluable = false
  }
  g2checks.profitability = { pass: profPass, source: profSource, evaluable: gate2Evaluable,
    roic, roe, debtToEquity: de }

  // Operating margin: sector-specific substitutes
  if (profile.name === 'banks') {
    const roeOk = roe == null || roe >= 8
    const nmOk  = f.netMargin == null || f.netMargin > 0
    const bankPass = roeOk && nmOk
    // Override profitability source with bank-specific label
    if (profSource && profSource !== 'null') {
      g2checks.profitability = { ...g2checks.profitability, source: 'bank_roe_net_margin' }
    }
    g2checks.operatingMargin = { pass: bankPass, cause: bankPass ? null : 'bank_net_margin',
      substitute:'banks:ROE>=8+NetMargin>0', roePass: roeOk, netMarginPass: nmOk }
  } else if (profile.name === 'reit') {
    // Gate2 uses tighter leverage threshold than Gate1 (quality vs solvency)
    const g2max = profile.gate2DebtMax ?? 8
    const deOk  = de == null || de <= g2max
    // Override profitability source with REIT-specific label
    if (g2checks.profitability?.source) {
      g2checks.profitability = { ...g2checks.profitability, source: 'reit_roe_leverage' }
    }
    g2checks.operatingMargin = { pass: deOk, cause: deOk ? null : 'reit_leverage',
      substitute:'reit:D/E<=gate2threshold', threshold: g2max }
  } else {
    g2checks.operatingMargin = { pass: f.operatingMargin == null || f.operatingMargin > 0, value: f.operatingMargin }
  }

  const g2pass=Object.values(g2checks).every(c=>c.pass)
  if (!g2pass) return { gate1:{pass:true,checks:g1checks}, gate2:{pass:false,checks:g2checks,
    profCheckPass: g2checks.profitability?.pass ?? null,
    marginCheckPass: g2checks.operatingMargin?.pass ?? null,
    cause: !g2checks.profitability?.pass ? 'profitability' : (g2checks.operatingMargin?.cause ?? 'operating_margin'),
  }, activeCap:58, activeGate:'gate2' }
  return { gate1:{pass:true,checks:g1checks}, gate2:{pass:true,checks:g2checks,
    profCheckPass: g2checks.profitability?.pass ?? null,
    marginCheckPass: g2checks.operatingMargin?.pass ?? null,
  }, activeCap:null, activeGate:null }
}

// Grade
const GRADES=[{min:85,label:'STRONG BUY'},{min:70,label:'BUY'},{min:55,label:'HOLD'},{min:40,label:'SELL'},{min:0,label:'STRONG SELL'}]
function getGrade(s) { return GRADES.find(g=>s>=g.min)?.label ?? 'STRONG SELL' }

// Confidence
function confidence(scores, ohlcvLen, spyLen) {
  let ded = 0
  const nulls = [scores.growth.nullFields, scores.quality.nullFields,
    scores.valuation.nullFields, scores.technical.nullFields,
    scores.strength.skipped ? 0 : (scores.strength.nullFields??0)
  ].reduce((a,b)=>a+b,0)
  ded += nulls*5
  if (scores.strength.skipped) ded+=10
  if (ohlcvLen<20) ded+=15; else if(ohlcvLen<100) ded+=8
  if (spyLen<20) ded+=5
  return Math.max(Math.round(100-ded), 20)
}

/* ════════════════════════════════════════════════════════════
   MAIN ORCHESTRATOR
════════════════════════════════════════════════════════════ */
export function computeConviction(fundamentals, ohlcv=[], spyOhlcv=[], currentPrice=null, sector='', sectorEtf='') {
  const f = fundamentals
  const ticker = f.ticker
  const profile = getProfile(ticker, sector, sectorEtf)

  const gw = growth(f)
  const ql = quality(f)
  const st = strength(f, profile)
  const vl = valuation(f)
  const tc = technical(ohlcv, spyOhlcv, currentPrice ?? f.price)
  const rk = risk(f, profile)
  const gt = gates(f, profile)

  const scores = { growth:gw, quality:ql, strength:st, valuation:vl, technical:tc }

  const rawScore = Math.round(
    [gw,ql,st,vl,tc].reduce((s,d)=>s+(d.score??0),0)*10)/10

  const scoreAfterRisk = Math.max(0, Math.round((rawScore + rk.penalty)*10)/10)
  const finalScore = gt.activeCap!=null ? Math.min(scoreAfterRisk, gt.activeCap) : scoreAfterRisk

  const conf = confidence(scores, ohlcv.length, spyOhlcv.length)
  const grade = getGrade(finalScore)

  const upside = (f.targetMean && currentPrice)
    ? Math.round(((f.targetMean/currentPrice)-1)*1000)/10
    : null

  return {
    ticker, rawScore, riskPenalty: rk.penalty, scoreAfterRisk,
    gateCap: gt.activeCap, activeGate: gt.activeGate, finalScore,
    grade, confidence: conf, sectorProfile: profile.name,
    breakdown: {
      growth:    { score:gw.score,    max:25, nullFields:gw.nullFields, growthQualityModifier:gw.growthQualityModifier??1.0, components:gw.components },
      quality:   { score:ql.score,    max:20, nullFields:ql.nullFields },
      strength:  { score:st.score,    max:15, nullFields:st.nullFields, skipped:st.skipped, negativeEquity:st.negativeEquity===true },
      valuation: { score:vl.score,    max:15, metric:vl.metric, value:vl.value },
      technical: { score:tc.score,    max:15, nullFields:tc.nullFields, extended:tc.extended===true, extensionPenalty:tc.extended?-1:0, components:tc.components },
      risk:      { penalty:rk.penalty, flags:rk.flags },
    },
    gates: { gate1:gt.gate1, gate2:gt.gate2 },
    negativeEquity: st.negativeEquity === true,
    growthQualityModifier: gw.growthQualityModifier ?? 1.0,
    technical: {
      ema200:tc.ema200, aboveEMA200:tc.aboveEMA200,
      rsi:tc.rsi, relStrengthWeighted:tc.relStrengthWeighted,
      currentPrice: currentPrice,
    },
    wallStreet: {
      targetMean:f.targetMean, upside,
      analysts:(f.strongBuy??0)+(f.buy??0)+(f.hold??0)+(f.sell??0)+(f.strongSell??0),
    },
    modelVersion: 'v1.1',
  }
}
