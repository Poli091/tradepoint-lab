/**
 * worker/conviction.js — Conviction Score v1.2
 * v1.2 changes vs v1.1:
 *   - FCF Growth: TTM YoY (not 5Y CAGR); fallback fcfTTM/fcfPriorTTM
 *   - Growth: Revenue CAGR 3Y + EPS CAGR 3Y scored directly (not only via acceleration)
 *   - Quality: ROIC → ROI → ROE priority (not Math.max); ROE gets leverage guard
 *   - Technical: Volume Z-score (2 pts); RS reduced 7→5; total still 15
 *   - Banks: NOT_RATED (no comparable Strength metrics available)
 *   - Missing data: no renormalization — absent = 0 pts; coverage caps verdict
 *   - EMA200 requires 200 bars (was Math.min)
 *   - RSI: AND logic (was OR)
 *   - Gate 1: opMargin >= -25 (was > -25)
 *   - Upside: resolvedPrice = currentPrice ?? f.price
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

const INDUSTRY_MAP = {
  'Banks - Large': 'banks',
  'Banks - Regional': 'banks',
  'Banks': 'banks',
}

function getProfile(ticker, sector='', sectorEtf='', industry='') {
  return PROFILES[TICKER_OVERRIDES[ticker?.toUpperCase()]]
    ?? PROFILES[ETF_MAP[sectorEtf]]
    ?? PROFILES[INDUSTRY_MAP[industry]]
    ?? PROFILES[SECTOR_MAP[sector]]
    ?? PROFILES.default
}

/* ════════════════════════════════════════════════════════════
   SCORING UTILITIES
════════════════════════════════════════════════════════════ */

function bracket(value, brackets, type='max') {
  if (value == null || !brackets) return null
  for (const [thresh, pts] of brackets) {
    if (type === 'max' && value <= thresh) return pts
    if (type === 'min' && value >= thresh) return pts
  }
  return 0
}

/** v1.2: no renormalization — missing = 0 pts; returns {score, nullFields, coverage} */
function sumComponents(components) {
  let score = 0, nullFields = 0, totalWeight = 0
  for (const {score: s, weight} of components) {
    totalWeight += weight
    if (s == null) nullFields++
    else score += s
  }
  const coverage = totalWeight > 0 ? (totalWeight - nullFields * (totalWeight / components.length)) / totalWeight : 0
  return { score: Math.round(score * 10) / 10, nullFields, coverage }
}

/* ════════════════════════════════════════════════════════════
   §1 GROWTH (25 pts)
   Revenue YoY(5) + Revenue CAGR 3Y(3) + EPS YoY(5) + EPS CAGR 3Y(3) + FCF TTM YoY(5) + Acceleration(4)
════════════════════════════════════════════════════════════ */

function scoreRevYoY(v)   { if(v==null)return null; const w=Math.min(v,60);  return w>25?5:w>=15?4:w>=10?3:w>=0?1:0 }
function scoreRevCagr(v)  { if(v==null)return null; const w=Math.min(v,60);  return w>20?3:w>=10?2:w>=0?1:0 }
function scoreEpsYoY(v)   { if(v==null)return null; if(v>500)return 3; const w=Math.min(v,80); return w>25?5:w>=15?4:w>=10?3:w>=0?1:0 }
function scoreEpsCagr(v)  { if(v==null)return null; const w=Math.min(v,80);  return w>20?3:w>=10?2:w>=0?1:0 }
function scoreFcfTtmYoy(v){ if(v==null)return null; const w=Math.min(v,100); return w>20?5:w>=10?3:w>=0?2:0 }

function resolveFcfGrowth(f) {
  if (Number.isFinite(f.fcfGrowthTTMYoY)) return f.fcfGrowthTTMYoY
  if (!Number.isFinite(f.fcfTTM) || !Number.isFinite(f.fcfPriorTTM) || f.fcfPriorTTM === 0) return null
  // Negative-base edge cases
  if (f.fcfPriorTTM < 0 && f.fcfTTM > 0) return 100  // turnaround positive — capped by scorer
  if (f.fcfPriorTTM < 0 && f.fcfTTM <= 0) return null  // pct not interpretable
  return ((f.fcfTTM / f.fcfPriorTTM) - 1) * 100
}

function scoreAcceleration(f) {
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

function growthModifier(f) {
  if (f.operatingMargin==null || f.grossMargin==null) return 1.0
  const burden = f.grossMargin - f.operatingMargin
  if (burden > 40 && f.operatingMargin < 0)  return 0.65
  if (burden > 30 && f.operatingMargin < 5)  return 0.85
  return 1.0
}

function growth(f) {
  const fcfGrowth = resolveFcfGrowth(f)
  const comps = [
    { score: scoreRevYoY(f.revenueGrowthYoY),  weight: 5 },
    { score: scoreRevCagr(f.revenueGrowth3Y),   weight: 3 },
    { score: scoreEpsYoY(f.epsGrowthYoY),       weight: 5 },
    { score: scoreEpsCagr(f.epsGrowth3Y),        weight: 3 },
    { score: scoreFcfTtmYoy(fcfGrowth),          weight: 5 },
    { score: scoreAcceleration(f),               weight: 4 },
  ]
  const base = sumComponents(comps)
  const mod  = growthModifier(f)
  return { ...base, score: base.score != null ? Math.round(base.score * mod * 10) / 10 : 0,
    growthQualityModifier: mod, fcfGrowthUsed: fcfGrowth }
}

/* ════════════════════════════════════════════════════════════
   §2 QUALITY (20 pts)
   ROIC→ROI→ROE priority(7) + OpMargin(6) + GrossMargin(4) + FCF Margin(3)
════════════════════════════════════════════════════════════ */

function quality(f, profile) {
  const roeDEThreshold = (profile?.name === 'utilities' || profile?.name === 'reit') ? 8 : 4
  // Priority: ROIC → ROI → ROE (never take max)
  let profVal = null, profSource = null
  if (f.roic != null) { profVal = f.roic; profSource = 'roic' }
  else if (f.roi  != null) { profVal = f.roi;  profSource = 'roi' }
  else if (f.roe  != null) {
    // ROE with leverage guard: D/E must be known and within bounds
    // If D/E is absent we cannot validate leverage — exclude conservatively
    if (Number.isFinite(f.debtToEquity) && f.debtToEquity >= 0 && f.debtToEquity <= roeDEThreshold) {
      profVal = f.roe; profSource = 'roe'
    } else {
      profVal = null
      profSource = Number.isFinite(f.debtToEquity) ? 'roe_excluded_leverage' : 'roe_excluded_missing_leverage'
    }
  }
  const profScoreRaw = profVal==null ? null
    : profVal>20?7 : profVal>=15?6 : profVal>=10?4 : profVal>=8?2 : 0
  // Utilities/REIT: ROE allowed as fallback but high D/E means leverage amplifies ROE.
  // Cap profScore at 4/7 to avoid rewarding capital structure rather than returns.
  const profCapApplied = profSource === 'roe' && (profile?.name === 'utilities' || profile?.name === 'reit')
  const profScore = profCapApplied ? Math.min(profScoreRaw ?? 0, 4) : profScoreRaw

  const opScore  = f.operatingMargin==null ? null
    : f.operatingMargin>30?6 : f.operatingMargin>=20?5 : f.operatingMargin>=10?3 : f.operatingMargin>=0?1 : 0
  const gmScore  = f.grossMargin==null ? null
    : f.grossMargin>60?4 : f.grossMargin>=40?3 : f.grossMargin>=20?2 : 0
  const fcfM     = f.fcfMarginTTM ?? null
  const fcfScore = fcfM==null ? null : fcfM>20?3 : fcfM>=10?2 : fcfM>=0?1 : 0

  return { ...sumComponents([
    {score:profScore,weight:7},{score:opScore,weight:6},
    {score:gmScore,weight:4},{score:fcfScore,weight:3}
  ]), profitabilitySource: profSource, profitabilityValue: profVal, profCapApplied }
}

/* ════════════════════════════════════════════════════════════
   §3 STRENGTH (15 pts) — banks: NOT_RATED
════════════════════════════════════════════════════════════ */

function strength(f, profile) {
  if (profile.name === 'banks') return { score: null, nullFields: 3, notRated: true }
  let deScore, negativeEquity = false
  if (f.debtToEquity == null)       { deScore = null }
  else if (f.debtToEquity < 0)      { deScore = 0; negativeEquity = true }
  else                               { deScore = bracket(f.debtToEquity, profile.debt, 'max') }
  const cr = bracket(f.currentRatio,     profile.cr, 'min')
  const ic = bracket(f.interestCoverage, profile.ic, 'min')
  return { ...sumComponents([{score:deScore,weight:5},{score:cr,weight:5},{score:ic,weight:5}]), negativeEquity }
}

/* ════════════════════════════════════════════════════════════
   §4 VALUATION (15 pts) — cascade: PEG → EV/FCF → EV/EBITDA → P/E
════════════════════════════════════════════════════════════ */

function pegScore(v)      { if(!v||v<=0)return null; return v<0.5?15:v<1?13:v<1.5?10:v<2?7:v<3?4:1 }
function evFcfScore(v)    { if(!v||v<=0)return null; return v<15?15:v<25?12:v<35?9:v<50?6:v<75?3:1 }
function evEbitdaScore(v) { if(!v||v<=0)return null; return v<10?15:v<15?12:v<20?9:v<25?6:v<35?3:1 }
function peScore(v)       { if(!v||v<=0)return null; return v<10?15:v<15?12:v<20?9:v<30?6:v<50?3:1 }

function valuation(f) {
  for (const {metric,fn,val} of [
    {metric:'PEG',      fn:pegScore,      val:f.peg},
    {metric:'EV/FCF',   fn:evFcfScore,    val:f.evFcf},
    {metric:'EV/EBITDA',fn:evEbitdaScore, val:f.evEbitda},
    {metric:'P/E',      fn:peScore,       val:f.pe},
  ]) {
    const s = fn(val)
    if (s!=null) return { score:s, nullFields:0, metric, value:val }
  }
  return { score:0, nullFields:1, metric:null, value:null }
}

/* ════════════════════════════════════════════════════════════
   §5 TECHNICAL (15 pts)
   EMA trend(5) + RSI(3) + Relative Strength(5) + Volume Z-score(2)
════════════════════════════════════════════════════════════ */

function calcEMA(closes, period) {
  if (!closes || closes.length < period) return null
  const k = 2/(period+1)
  let ema = closes.slice(0,period).reduce((a,b)=>a+b,0)/period
  for (let i=period; i<closes.length; i++) ema = closes[i]*k+ema*(1-k)
  return ema
}

function calcRSI(closes, period=14) {
  if (!closes || closes.length<period+1) return null
  let gains=0, losses=0
  for (let i=1;i<=period;i++) { const d=closes[i]-closes[i-1]; if(d>0)gains+=d; else losses-=d }
  let ag=gains/period, al=losses/period
  for (let i=period+1;i<closes.length;i++) {
    const d=closes[i]-closes[i-1]
    ag=(ag*(period-1)+(d>0?d:0))/period; al=(al*(period-1)+(d<0?-d:0))/period
  }
  if (al===0) return 100
  return Math.round((100-100/(1+ag/al))*100)/100
}

function periodReturn(ohlcv, days) {
  if (!ohlcv||ohlcv.length<days) return null
  const sl=ohlcv.slice(-days)
  const first=sl[0]?.price??sl[0]?.close, last=sl[sl.length-1]?.price??sl[sl.length-1]?.close
  if (!first||!last||first===0) return null
  return ((last-first)/first)*100
}

function calcVolumeZScore(ohlcv, period=20) {
  if (!ohlcv || ohlcv.length < period+1) return null
  const recent = ohlcv.slice(-period-1, -1).map(b => b.volume ?? 0)
  const mean   = recent.reduce((a,b)=>a+b,0) / period
  const std    = Math.sqrt(recent.reduce((s,v)=>s+(v-mean)**2,0) / period)
  const todayVol = ohlcv[ohlcv.length-1]?.volume ?? 0
  return std === 0 ? 0 : (todayVol - mean) / std
}

function technical(ohlcv, spyOhlcv, currentPrice) {
  const closes = (ohlcv||[]).map(d=>d.price??d.close)
  // EMA requires full period
  const ema200 = closes.length >= 200 ? calcEMA(closes, 200) : null
  const ema50  = closes.length >= 50  ? calcEMA(closes, 50)  : null
  const price  = currentPrice ?? closes[closes.length-1]
  const above  = ema200!=null && price!=null ? price>ema200 : null

  let emaScore = above==null ? null : above ? 5 : 0
  let extended = false
  if (above && ema50 && price && closes.length>=15) {
    const recent = closes.slice(-15)
    const atr = recent.slice(1).reduce((s,c,i)=>s+Math.abs(c-recent[i]),0)/(recent.length-1)
    if (atr>0 && (price-ema50)>2.5*atr) { emaScore=Math.max(0,(emaScore??0)-1); extended=true }
  }

  const rsi     = calcRSI(closes)
  // RSI: AND logic (fix v1.1 bug)
  const rsiScore = rsi==null ? null : (rsi>=40&&rsi<=60)?3 : (rsi>=30&&rsi<=70)?2 : 1

  // Relative Strength — 5 pts (was 7)
  const PERIODS = [{days:21,w:1},{days:63,w:2},{days:126,w:1.5}]
  let totalW=0, wRS=0
  const rsBreakdown={}
  for (const {days,w,label} of PERIODS.map((p,i)=>({...p,label:['1M','3M','6M'][i]}))) {
    const tr=periodReturn(ohlcv,days), sr=periodReturn(spyOhlcv,days)
    if (tr!=null&&sr!=null) {
      const rs=tr-sr; rsBreakdown[label]={rs:Math.round(rs*100)/100}
      wRS+=rs*w; totalW+=w
    }
  }
  const avgRS  = totalW>0 ? Math.round((wRS/totalW)*100)/100 : null
  const rsScore = avgRS==null?null : avgRS>15?5:avgRS>10?4:avgRS>5?3:avgRS>0?2:avgRS>-5?1:0

  // Volume Z-score — 2 pts
  const volZ     = calcVolumeZScore(ohlcv)
  const volScore = volZ==null ? null : volZ>=2?2 : volZ>=1?1 : volZ>-1?0.5 : 0

  const comps = [
    {score:emaScore,weight:5},{score:rsiScore,weight:3},
    {score:rsScore, weight:5},{score:volScore,weight:2},
  ]
  const {score, nullFields} = sumComponents(comps)

  return { score, nullFields, ema200:ema200?Math.round(ema200*100)/100:null,
    currentPrice:price, aboveEMA200:above, rsi, relStrengthWeighted:avgRS,
    volumeZScore:volZ, extended, rsBreakdown }
}

/* ════════════════════════════════════════════════════════════
   §6 RISK (penalty up to -10)
════════════════════════════════════════════════════════════ */

function risk(f, profile) {
  const flags=[], triggered=[]; let total=0
  if (f.beta!=null&&f.beta>2)          { flags.push('beta_high');      total-=2; triggered.push({flag:'beta_high',penalty:-2}) }
  if (f.netMargin!=null&&f.netMargin<-10) { flags.push('margin_negative'); total-=3; triggered.push({flag:'margin_negative',penalty:-3}) }
  const dmax=profile.riskDebtMax
  if (dmax!=null&&f.debtToEquity!=null&&f.debtToEquity>dmax) { flags.push('debt_extreme'); total-=3; triggered.push({flag:'debt_extreme',penalty:-3}) }
  return { penalty:Math.max(total,-10), flags, breakdown:triggered }
}

/* ════════════════════════════════════════════════════════════
   §7 GATES v1.2
════════════════════════════════════════════════════════════ */

function gates(f, profile) {
  // Gate 1
  const g1checks={}
  const revOk=(f.revenueGrowth3Y!=null&&f.revenueGrowth3Y>=0)||(f.revenueGrowthYoY!=null&&f.revenueGrowthYoY>=0)||(f.revenueGrowth3Y==null&&f.revenueGrowthYoY==null)
  g1checks.revenueGrowth={pass:revOk}
  g1checks.operatingMargin={pass:f.operatingMargin==null||f.operatingMargin>=-25}  // >= -25 (fix)
  if (profile.name!=='banks'&&profile.gate1DebtMax!=null) {
    g1checks.debtEquity={pass:f.debtToEquity==null||f.debtToEquity<=profile.gate1DebtMax}
  } else { g1checks.debtEquity={pass:true,skipped:true} }
  const g1pass=Object.values(g1checks).every(c=>c.pass)
  if (!g1pass) return { gate1:{pass:false,checks:g1checks}, gate2:{pass:false,skipped:true}, activeCap:35, activeGate:'gate1' }

  // Gate 2
  const g2checks={}
  const roic=f.roic??null, roe=f.roe??null, de=f.debtToEquity??null
  const debtThreshold=profile.gate1DebtMax??4
  let profPass, profSource, gate2Evaluable=false
  if (roic!=null) { gate2Evaluable=true; profPass=roic>=8; profSource='roic' }
  else if (roe!=null) {
    gate2Evaluable=true
    const negEq=de!=null&&de<0, levOk=!negEq&&(de==null||de<=debtThreshold)
    profPass=roe>=8&&levOk
    profSource=!levOk?'roe_failed_leverage_check':roe>=8?'roe_leverage_ok':'roe_below_threshold'
  } else { profPass=true; profSource=null; gate2Evaluable=false }
  g2checks.profitability={pass:profPass,source:profSource,evaluable:gate2Evaluable,roic,roe,debtToEquity:de}

  if (profile.name==='banks') {
    const roeOk=roe==null||roe>=8, nmOk=f.netMargin==null||f.netMargin>0
    g2checks.profitability={...g2checks.profitability,source:'bank_roe_net_margin'}
    g2checks.operatingMargin={pass:roeOk&&nmOk,substitute:'banks:ROE>=8+NetMargin>0',roePass:roeOk,netMarginPass:nmOk}
  } else if (profile.name==='reit') {
    const g2max=profile.gate2DebtMax??8, deOk=de==null||de<=g2max
    g2checks.profitability={...g2checks.profitability,source:'reit_roe_leverage'}
    g2checks.operatingMargin={pass:deOk,substitute:'reit:D/E<=gate2threshold',threshold:g2max}
  } else {
    g2checks.operatingMargin={pass:f.operatingMargin==null||f.operatingMargin>0,value:f.operatingMargin}
  }

  const g2pass=Object.values(g2checks).every(c=>c.pass)
  if (!g2pass) return { gate1:{pass:true,checks:g1checks}, gate2:{pass:false,checks:g2checks,
    cause:!g2checks.profitability?.pass?'profitability':(g2checks.operatingMargin?.cause??'operating_margin'),
  }, activeCap:58, activeGate:'gate2' }
  return { gate1:{pass:true,checks:g1checks}, gate2:{pass:true,checks:g2checks}, activeCap:null, activeGate:null }
}

/* ════════════════════════════════════════════════════════════
   §8 COVERAGE & VERDICT
════════════════════════════════════════════════════════════ */

const GRADES=[
  {min:85,label:'STRONG BUY'},{min:70,label:'BUY'},
  {min:55,label:'HOLD'},{min:40,label:'SELL'},{min:0,label:'STRONG SELL'},
]
function getGrade(s) { return GRADES.find(g=>s>=g.min)?.label ?? 'STRONG SELL' }

/** Coverage: fraction of component slots that have real data */
function computeCoverage(scores) {
  const totalNull =
    (scores.growth.nullFields    ?? 0) +
    (scores.quality.nullFields   ?? 0) +
    (scores.valuation.nullFields ?? 0) +
    (scores.strength.notRated ? 3 : (scores.strength.nullFields ?? 0)) +
    (scores.technical.nullFields ?? 0)
  const totalSlots = 6 + 4 + 1 + 3 + 4  // growth(6)+quality(4)+valuation(1)+strength(3)+technical(4)
  return Math.max(0, Math.round((1 - totalNull / totalSlots) * 100))
}

/** Apply coverage cap to verdict */
function applyCoverageCap(grade, coveragePct) {
  if (coveragePct >= 75) return grade
  if (coveragePct >= 55) {
    const HOLD_CAP = ['STRONG BUY','BUY','HOLD']
    return HOLD_CAP.includes(grade) ? Math.max(['STRONG BUY','BUY','HOLD'].indexOf(grade), 0) >= 2 ? grade : 'HOLD' : grade
  }
  return 'NOT_RATED'
}

/* ════════════════════════════════════════════════════════════
   §9 CONFIDENCE
════════════════════════════════════════════════════════════ */

function confidence(scores, ohlcvLen, spyLen) {
  let ded=0
  const nulls=[scores.growth.nullFields, scores.quality.nullFields,
    scores.valuation.nullFields, scores.technical.nullFields,
    scores.strength.notRated ? 0 : (scores.strength.nullFields??0)
  ].reduce((a,b)=>a+b,0)
  ded += nulls*5
  if (scores.strength.notRated) ded+=10
  if (ohlcvLen<20) ded+=15; else if(ohlcvLen<100) ded+=8
  if (spyLen<20) ded+=5
  return Math.max(Math.round(100-ded), 20)
}

/* ════════════════════════════════════════════════════════════
   MAIN ORCHESTRATOR
════════════════════════════════════════════════════════════ */

export function computeConviction(fundamentals, ohlcv=[], spyOhlcv=[], currentPrice=null, sector='', sectorEtf='', industry='') {
  const f = fundamentals
  const ticker = f.ticker
  const profile = getProfile(ticker, sector, sectorEtf, industry)

  // Banks: NOT_RATED — no comparable Strength metrics available
  if (profile.name === 'banks') {
    return {
      ticker, grade:'NOT_RATED', finalScore:null, rawScore:null, riskPenalty:0,
      scoreAfterRisk:null, gateCap:null, activeGate:'SECTOR_UNSUPPORTED',
      reason:'BANK_STRENGTH_METRICS_UNAVAILABLE',
      sectorProfile:'banks', modelVersion:'v1.2',
      breakdown:null, gates:null, confidence:null, wallStreet:{ targetMean:null, upside:null, analysts:0 },
      technical:{ ema200:null, aboveEMA200:null, rsi:null, relStrengthWeighted:null, volumeZScore:null, currentPrice:null },
    }
  }

  const resolvedPrice = currentPrice ?? f.price ?? null

  const gw = growth(f)
  const ql = quality(f, profile)
  const st = strength(f, profile)
  const vl = valuation(f)
  const tc = technical(ohlcv, spyOhlcv, resolvedPrice)
  const rk = risk(f, profile)
  const gt = gates(f, profile)

  const scores = { growth:gw, quality:ql, strength:st, valuation:vl, technical:tc }

  // v1.2: no renormalization — components sum directly, missing = 0
  const rawScore = Math.round(
    [gw,ql,st,vl,tc].reduce((s,d)=>s+(d.score??0),0)*10)/10

  const scoreAfterRisk = Math.max(0, Math.round((rawScore+rk.penalty)*10)/10)
  const cappedScore    = gt.activeCap!=null ? Math.min(scoreAfterRisk, gt.activeCap) : scoreAfterRisk

  const coveragePct = computeCoverage(scores)
  const conf        = confidence(scores, ohlcv.length, spyOhlcv.length)

  let grade = getGrade(cappedScore)
  if (coveragePct < 55) grade = 'NOT_RATED'
  else if (coveragePct < 75) {
    const maxAllowed = ['STRONG BUY','BUY','HOLD']
    if (!maxAllowed.includes(grade)) {} // SELL/STRONG SELL unaffected
    else if (['STRONG BUY','BUY'].includes(grade)) grade = 'HOLD'
  }

  const upside = (f.targetMean!=null && resolvedPrice!=null && resolvedPrice>0)
    ? Math.round(((f.targetMean/resolvedPrice)-1)*1000)/10
    : null

  return {
    ticker, rawScore, riskPenalty:rk.penalty, scoreAfterRisk,
    finalScore:cappedScore, gateCap:gt.activeCap, activeGate:gt.activeGate,
    grade, confidence:conf, coveragePct, sectorProfile:profile.name,
    breakdown:{
      growth:    {score:gw.score,   max:25, nullFields:gw.nullFields, growthQualityModifier:gw.growthQualityModifier??1, fcfGrowthUsed:gw.fcfGrowthUsed},
      quality:   {score:ql.score,   max:20, nullFields:ql.nullFields, profitabilitySource:ql.profitabilitySource, profCapApplied:ql.profCapApplied??false},
      strength:  {score:st.score,   max:15, nullFields:st.nullFields, negativeEquity:st.negativeEquity===true},
      valuation: {score:vl.score,   max:15, metric:vl.metric, value:vl.value},
      technical: {score:tc.score,   max:15, nullFields:tc.nullFields, extended:tc.extended, volumeZScore:tc.volumeZScore},
      risk:      {penalty:rk.penalty, flags:rk.flags},
    },
    gates:     {gate1:gt.gate1, gate2:gt.gate2},
    negativeEquity: st.negativeEquity===true,
    growthQualityModifier: gw.growthQualityModifier??1,
    technical: {
      ema200:tc.ema200, aboveEMA200:tc.aboveEMA200,
      rsi:tc.rsi, relStrengthWeighted:tc.relStrengthWeighted,
      volumeZScore:tc.volumeZScore, currentPrice:resolvedPrice,
    },
    wallStreet: {
      targetMean:f.targetMean, upside,
      analysts:(f.strongBuy??0)+(f.buy??0)+(f.hold??0)+(f.sell??0)+(f.strongSell??0),
    },
    modelVersion:'v1.2',
    modelFit: (() => {
      const reasons = []
      if (ql.profCapApplied) reasons.push('ROE_CAPPED_UTILITY_REIT')
      if (ql.profitabilitySource === 'roe_excluded_leverage') reasons.push('ROE_EXCLUDED_HIGH_LEVERAGE')
      if (ql.profitabilitySource === 'roe_excluded_missing_leverage') reasons.push('ROE_EXCLUDED_MISSING_LEVERAGE')
      if (ql.profitabilitySource == null) reasons.push('PROFITABILITY_MISSING')
      if (gw.fcfGrowthUsed == null) reasons.push('FCF_GROWTH_UNAVAILABLE')
      if (vl.metric == null) reasons.push('VALUATION_MISSING')
      if (tc.ema200 == null) reasons.push('EMA200_INSUFFICIENT_BARS')
      if (gt.activeGate === 'gate2') reasons.push('GATE2_FAILED')
      const status = reasons.length === 0 ? 'FULL'
        : reasons.some(r =>
            r.includes('MISSING') || r.includes('GATE2') ||
            r.includes('EXCLUDED') || r.includes('UNAVAILABLE')
          ) ? 'LIMITED'
        : 'ADJUSTED'
      return { status, reasons }
    })(),
    missingFields: [
      ...(ql.profitabilitySource == null ? ['roic','roi','roe'] : []),
      ...(ql.profitabilitySource === 'roe_excluded_missing_leverage' ? ['debtToEquity'] : []),
      ...(gw.fcfGrowthUsed == null ? ['fcfGrowthTTMYoY','fcfTTM/fcfPriorTTM'] : []),
      ...(vl.metric == null ? ['peg','evFcf','evEbitda','pe'] : []),
      ...(tc.ema200 == null ? ['ema200_needs200bars'] : []),
    ],
  }
}
