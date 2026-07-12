/**
 * MODULE: conviction/decision/engine.js  v2.0
 * Decision Engine — synthesizes all motors into one actionable decision.
 *
 * Philosophy: does not create new information; synthesizes existing motor outputs.
 *
 * Layer 1 — Deterministic: action phrase + investment phase from grade matrix
 * Layer 2 — Decision Strength: weighted signal quality (replaceable by ONNX later)
 * Note: "Decision Strength" ≠ probability of success. It measures evidence strength.
 *       When ONNX arrives: Decision Strength (rules) + Prediction Confidence (ML).
 */

const GRADE_RANK = {'STRONG BUY':4,'BUY':3,'HOLD':2,'SELL':1,'STRONG SELL':0}

/* ── Action phrases ──────────────────────────────────── */
const ACTION_MATRIX = {
  'STRONG BUY|STRONG BUY': 'Strong accumulation signal',
  'STRONG BUY|BUY':         'Strong accumulation signal',
  'BUY|STRONG BUY':         'Suitable for accumulation',
  'BUY|BUY':                'Suitable for accumulation',
  'STRONG BUY|HOLD':        'Accumulate on pullbacks',
  'BUY|HOLD':               'Accumulate on pullbacks',
  'STRONG BUY|SELL':        'Wait for technical recovery',
  'BUY|SELL':               'Wait for technical recovery',
  'STRONG BUY|STRONG SELL': 'Wait for technical recovery',
  'BUY|STRONG SELL':        'Wait for technical recovery',
  'HOLD|STRONG BUY':        'Consider a swing entry',
  'HOLD|BUY':               'Consider a swing entry',
  'HOLD|HOLD':              'Monitor position',
  'HOLD|SELL':              'Monitor — thesis weakening',
  'HOLD|STRONG SELL':       'Monitor — thesis weakening',
  'SELL|STRONG BUY':        'Counter-trend trade only',
  'SELL|BUY':               'Counter-trend trade only',
  'SELL|HOLD':              'Reduce exposure',
  'SELL|SELL':              'Reduce exposure',
  'SELL|STRONG SELL':       'Avoid new positions',
  'STRONG SELL|STRONG BUY': 'Counter-trend trade only',
  'STRONG SELL|BUY':        'Counter-trend trade only',
  'STRONG SELL|HOLD':       'Avoid new positions',
  'STRONG SELL|SELL':       'Avoid new positions',
  'STRONG SELL|STRONG SELL':'Avoid new positions',
}
const ACTION_LT_ONLY = {
  'STRONG BUY':'Suitable for accumulation','BUY':'Suitable for accumulation',
  'HOLD':'Monitor position','SELL':'Reduce exposure','STRONG SELL':'Avoid new positions',
}

/* ── Investment Phase ────────────────────────────────── */
const PHASE_MATRIX = {
  'STRONG BUY|STRONG BUY':'Accumulation', 'STRONG BUY|BUY':'Accumulation',
  'BUY|STRONG BUY':'Accumulation',        'BUY|BUY':'Accumulation',
  'STRONG BUY|HOLD':'Selective Accumulation','BUY|HOLD':'Selective Accumulation',
  'STRONG BUY|SELL':'Re-evaluation',      'BUY|SELL':'Re-evaluation',
  'STRONG BUY|STRONG SELL':'Re-evaluation','BUY|STRONG SELL':'Re-evaluation',
  'HOLD|STRONG BUY':'Monitoring',         'HOLD|BUY':'Monitoring',
  'HOLD|HOLD':'Monitoring',               'HOLD|SELL':'Monitoring',
  'HOLD|STRONG SELL':'Monitoring',
  'SELL|STRONG BUY':'Distribution',       'SELL|BUY':'Distribution',
  'SELL|HOLD':'Distribution',             'SELL|SELL':'Distribution',
  'SELL|STRONG SELL':'Avoidance',
  'STRONG SELL|STRONG BUY':'Avoidance',   'STRONG SELL|BUY':'Avoidance',
  'STRONG SELL|HOLD':'Avoidance',         'STRONG SELL|SELL':'Avoidance',
  'STRONG SELL|STRONG SELL':'Avoidance',
}
const PHASE_LT_ONLY = {
  'STRONG BUY':'Accumulation','BUY':'Accumulation',
  'HOLD':'Monitoring','SELL':'Distribution','STRONG SELL':'Avoidance',
}

/* ── Analyst sentiment ───────────────────────────────── */
function analystSentiment(fund) {
  if (!fund) return null
  const bull=(fund.strongBuy??0)+(fund.buy??0), bear=(fund.sell??0)+(fund.strongSell??0)
  const total=bull+bear+(fund.hold??0)
  if (!total) return null
  const pct=(bull/total)*100
  return pct>=65?{label:'Bullish',score:100}:pct>=50?{label:'Mildly Bullish',score:75}
        :pct>=35?{label:'Neutral',score:50}:pct>=20?{label:'Mildly Bearish',score:25}:{label:'Bearish',score:0}
}

/* ── Decision Strength (evidence quality, not probability) ── */
function calcStrength(ltResult, swResult, alignment) {
  const ltR  = GRADE_RANK[ltResult?.grade]??2
  const swR  = swResult?(GRADE_RANK[swResult.grade]??2):null
  const fund = ltResult?.fundamentalsData
  const analysts = analystSentiment(fund)

  const ltScore = [0,25,50,85,100][ltR]??50
  // When swing is null (insufficient OHLCV), use 50 as neutral imputed score.
  // 50 is NOT an observed score — it avoids false bearish bias from missing data.
  // swing_score_imputed: true when swResult is null (for future audit trail)
  const SWING_NEUTRAL = 50   // neutral imputed score — not observed
  const swScore = swR!=null ? ([0,25,50,85,100][swR]??SWING_NEUTRAL) : SWING_NEUTRAL
  const swW = swR!=null ? 0.25 : 0.15   // lower weight when swing unavailable

  const total = ltScore*0.35 + swScore*swW + (alignment??50)*0.20
              + (analysts?.score??50)*0.15
              + ((ltResult?.riskPenalty??0)<-3?0:(ltResult?.riskPenalty??0)<0?2.5:5)
  return Math.round(Math.min(100,Math.max(0,total)))
}

/* ── Primary driver ──────────────────────────────────── */
function primaryDriver(ltResult, swResult, alignment) {
  const ltR = GRADE_RANK[ltResult?.grade]??2
  const swR = swResult?(GRADE_RANK[swResult.grade]??2):null
  const bd  = ltResult?.breakdown??{}

  // Identify the strongest positive or limiting component
  if (ltR>=3 && (bd.quality?.score??0)/20>=0.8 && (bd.growth?.score??0)/25>=0.7)
    return 'Exceptional fundamentals'
  if (ltR>=3 && (bd.technical?.score??0)/15>=0.7 && swR!=null && swR>=3)
    return 'Strong technical confirmation'
  if (ltR>=3 && (alignment??0)>=85 && swR!=null && swR>=3)
    return 'High cross-engine alignment'
  if (ltR<=1 && (bd.valuation?.score??0)/15<0.2)
    return 'Elevated valuation — key constraint'
  if (ltR<=1 && (bd.technical?.score??0)/15<0.3)
    return 'Technical weakness — momentum absent'
  if ((ltResult?.riskPenalty??0)<-2)
    return 'Active risk constraints'
  if (ltR>=3 && (bd.valuation?.score??0)/15<0.3)
    return 'Strong company — stretched valuation'
  if (alignment!=null && alignment<50)
    return 'Mixed signals — engines diverge'
  if (swR!=null && swR>=3 && ltR<3)
    return 'Momentum improving, fundamentals lagging'
  return 'Balanced signal across components'
}

/* ── Grouped evidence (Engine / Market / Risk) ───────── */
function buildBecause(ltResult, swResult, alignment, analysts) {
  const ltR = GRADE_RANK[ltResult?.grade]??2
  const swR = swResult?(GRADE_RANK[swResult.grade]??2):null
  const riskPen = ltResult?.riskPenalty??0

  // Alignment: measure agreement, not quality — phrasing reflects that
  const alignOk = alignment!=null && alignment>=60
  const alignTxt = alignment==null ? 'Alignment: N/A'
    : ltR>=3&&swR!=null&&swR>=3 ? `Engines agree (${alignment}%)`
    : ltR<=1&&swR!=null&&swR<=1 ? `Engines agree bearish (${alignment}%)`
    : alignment>=60 ? `Alignment: ${alignment}%`
    : `Engines diverge (${alignment}%)`

  const engine = [
    {ok:ltR>=3,     text:`Long-Term: ${ltResult?.grade} (${ltResult?.finalScore??'—'}/100)`},
    ...(swR!=null?[{ok:swR>=3, text:`Swing: ${swResult.grade} (${swResult.finalScore}/100)`}]:[]),
    ...(alignment!=null?[{ok:alignOk, text:alignTxt}]:[]),
  ]
  const market = analysts ? [{ok:analysts.score>=75, text:`Analysts: ${analysts.label}`}] : []
  const risk   = [{
    ok: riskPen>=-1,
    text: riskPen<-1?`Risk: Active penalties (${riskPen} pts)`:'Risk: Within acceptable limits'
  }]

  return { engine, market, risk }
}

/* ── Decision Strength label ─────────────────────────── */
function strengthLabel(s) {
  return s>=85?'Very High':s>=70?'High':s>=55?'Moderate':s>=40?'Weak':'Very Weak'
}

/* ── Upgrade / Downgrade conditions ─────────────────── */
function buildConditions(action, ltResult, swResult) {
  const isBullish = ['Strong accumulation signal','Suitable for accumulation',
                     'Accumulate on pullbacks','Consider a swing entry'].includes(action)
  const isBearish = ['Reduce exposure','Avoid new positions','Counter-trend trade only'].includes(action)

  if (isBullish) {
    // Show what would DOWNGRADE
    const conds=[]
    conds.push(`LT conviction falls below 65`)
    if (swResult) conds.push('Swing loses EMA50 alignment')
    conds.push('Analyst consensus downgrades to HOLD')
    return {direction:'downgrade', label:'To downgrade this decision', conds:conds.slice(0,3)}
  } else if (isBearish) {
    // Show what would UPGRADE
    const conds=[]
    conds.push('LT conviction recovers above 55')
    conds.push('Analyst consensus upgrades to BUY')
    if (swResult) conds.push('Swing Engine confirms BUY signal')
    return {direction:'upgrade', label:'To upgrade this decision', conds:conds.slice(0,3)}
  } else {
    // Mixed — show path to clarity
    const conds=['LT or Swing grade changes by 2+ levels','Alignment rises above 80%']
    return {direction:'clarify', label:'What would resolve mixed signals', conds}
  }
}

function decisionColor(action) {
  if (['Strong accumulation signal','Suitable for accumulation'].includes(action)) return '#22C55E'
  if (['Accumulate on pullbacks','Consider a swing entry'].includes(action))       return '#86EFAC'
  if (['Wait for technical recovery','Monitor position'].includes(action))          return '#FBBF24'
  if (['Monitor — thesis weakening','Counter-trend trade only'].includes(action))   return '#F97316'
  return '#EF4444'
}

/* ── Main entry ──────────────────────────────────────── */
export function computeDecision(ltResult, swResult, alignment) {
  if (!ltResult) return null
  const ltGrade=ltResult.grade??'HOLD', swGrade=swResult?.grade
  const fund=ltResult?.fundamentalsData, analysts=analystSentiment(fund)

  const action  = swGrade?(ACTION_MATRIX[`${ltGrade}|${swGrade}`]??ACTION_LT_ONLY[ltGrade]??'Monitor position')
                         :(ACTION_LT_ONLY[ltGrade]??'Monitor position')
  const phase   = swGrade?(PHASE_MATRIX[`${ltGrade}|${swGrade}`]??PHASE_LT_ONLY[ltGrade]??'Monitoring')
                         :(PHASE_LT_ONLY[ltGrade]??'Monitoring')
  const strength    = calcStrength(ltResult, swResult, alignment)
  const driver      = primaryDriver(ltResult, swResult, alignment)
  const because     = buildBecause(ltResult, swResult, alignment, analysts)
  const conditions  = buildConditions(action, ltResult, swResult)
  const strengthLbl = strengthLabel(strength)

  return {
    action, phase, color:decisionColor(action),
    strength, strengthLabel:strengthLbl, driver, because, conditions,
    analysts, swingUsed:!!swResult, ltGrade, swGrade, alignment,
  }
}
