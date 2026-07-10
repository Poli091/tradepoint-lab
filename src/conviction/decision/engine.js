/**
 * MODULE: conviction/decision/engine.js
 * Decision Engine — synthesizes all motors into one actionable decision.
 *
 * Philosophy: does not create new information; only synthesizes
 * what Conviction Engine, Swing Engine, Alignment, and Analysts already produced.
 *
 * Layer 1 — Deterministic: action phrase from grade matrix (no weights)
 * Layer 2 — Confidence:    weighted signal strength (replaceable by ONNX later)
 */

const GRADE_RANK = {'STRONG BUY':4,'BUY':3,'HOLD':2,'SELL':1,'STRONG SELL':0}

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
  'STRONG BUY': 'Suitable for accumulation',
  'BUY':        'Suitable for accumulation',
  'HOLD':       'Monitor position',
  'SELL':       'Reduce exposure',
  'STRONG SELL':'Avoid new positions',
}

function analystSentiment(fund) {
  if (!fund) return null
  const bull = (fund.strongBuy??0) + (fund.buy??0)
  const bear = (fund.sell??0) + (fund.strongSell??0)
  const total = bull + bear + (fund.hold??0)
  if (!total) return null
  const pct = (bull/total)*100
  return pct>=65?{label:'Bullish',score:100} : pct>=50?{label:'Mildly Bullish',score:75}
       : pct>=35?{label:'Neutral',score:50}  : pct>=20?{label:'Mildly Bearish',score:25}
       : {label:'Bearish',score:0}
}

function calcConfidence(ltResult, swResult, alignment) {
  const ltR  = GRADE_RANK[ltResult?.grade] ?? 2
  const swR  = swResult ? (GRADE_RANK[swResult.grade] ?? 2) : null
  const fund = ltResult?.fundamentalsData
  const analysts = analystSentiment(fund)

  // LT contribution 35%
  const ltScore = [0,25,50,85,100][ltR] ?? 50
  // Swing contribution 25% (15% if not computed)
  const swScore  = swR != null ? ([0,25,50,85,100][swR] ?? 50) : 50
  const swWeight = swR != null ? 0.25 : 0.15
  // Alignment 20%
  const alignC   = (alignment ?? 50) * 0.20
  // Analysts 15%
  const analystC = (analysts?.score ?? 50) * 0.15
  // Risk 5%
  const riskC    = (ltResult?.riskPenalty ?? 0) < -3 ? 0 : (ltResult?.riskPenalty ?? 0) < 0 ? 2.5 : 5

  const total = ltScore*0.35 + swScore*swWeight + alignC + analystC + riskC
  return Math.round(Math.min(100, Math.max(0, total)))
}

function buildBecause(ltResult, swResult, alignment, analysts) {
  const bullets = []
  const ltR = GRADE_RANK[ltResult?.grade] ?? 2
  const swR = swResult ? (GRADE_RANK[swResult.grade] ?? 2) : null

  if (ltR >= 3) bullets.push({ok:true,  text:`Long-Term ${ltResult.grade} (${ltResult.finalScore}/100)`})
  if (swR!=null&&swR>=3) bullets.push({ok:true, text:`Swing ${swResult.grade} confirmed (${swResult.finalScore}/100)`})
  if ((alignment??0)>=80)  bullets.push({ok:true, text:`High engine alignment (${alignment}%)`})
  if (analysts?.label?.includes('Bullish')) bullets.push({ok:true, text:`Analyst consensus: ${analysts.label}`})
  if ((ltResult?.riskPenalty??0)===0) bullets.push({ok:true, text:'No active risk penalties'})
  if ((ltResult?.breakdown?.quality?.score??0)/20>=0.75) bullets.push({ok:true, text:'Quality above 75% efficiency'})

  if (ltR<=1) bullets.push({ok:false, text:`Long-Term ${ltResult?.grade} (${ltResult?.finalScore}/100)`})
  if (swR!=null&&swR<=1) bullets.push({ok:false, text:`Swing ${swResult.grade} — momentum weak`})
  if ((alignment??100)<50) bullets.push({ok:false, text:`Low engine alignment (${alignment}%) — signals diverge`})
  if (analysts?.label?.includes('Bearish')) bullets.push({ok:false, text:`Analyst consensus: ${analysts.label}`})
  if ((ltResult?.riskPenalty??0)<-1) bullets.push({ok:false, text:`Risk penalty active (${ltResult.riskPenalty} pts)`})
  if ((ltResult?.breakdown?.technical?.score??0)/15<0.4) bullets.push({ok:false, text:'Technical momentum below 40% efficiency'})
  if ((ltResult?.breakdown?.valuation?.score??0)/15<0.3) bullets.push({ok:false, text:'Valuation in lowest scoring bucket'})

  const pos = bullets.filter(b=>b.ok).slice(0,3)
  const neg = bullets.filter(b=>!b.ok).slice(0,2)
  return [...pos,...neg].slice(0,5)
}

function buildInvalidation(action, ltResult, swResult) {
  const conds = []
  if (['Suitable for accumulation','Strong accumulation signal','Accumulate on pullbacks'].includes(action)) {
    conds.push('LT conviction falls below 65')
    if (swResult) conds.push('Swing loses EMA50 alignment')
    conds.push('Analyst consensus downgrades to HOLD')
  } else if (action==='Wait for technical recovery') {
    conds.push('Swing Engine returns a BUY signal')
    conds.push('Alignment rises above 75%')
  } else if (action==='Consider a swing entry') {
    conds.push('LT conviction improves above 70')
    conds.push('Swing setup degrades below HOLD')
  } else if (['Reduce exposure','Avoid new positions'].includes(action)) {
    conds.push('LT conviction recovers above 55')
    conds.push('Analyst consensus upgrades to BUY')
    if (swResult) conds.push('Swing Engine confirms BUY')
  } else {
    conds.push('LT or Swing grade changes by 2+ levels')
    conds.push('Alignment diverges significantly')
  }
  return conds.slice(0,3)
}

function decisionColor(action) {
  if (['Strong accumulation signal','Suitable for accumulation'].includes(action)) return '#22C55E'
  if (['Accumulate on pullbacks','Consider a swing entry'].includes(action))       return '#86EFAC'
  if (['Wait for technical recovery','Monitor position'].includes(action))          return '#FBBF24'
  if (['Monitor — thesis weakening','Counter-trend trade only'].includes(action))   return '#F97316'
  return '#EF4444'
}

export function computeDecision(ltResult, swResult, alignment) {
  if (!ltResult) return null
  const ltGrade  = ltResult.grade ?? 'HOLD'
  const swGrade  = swResult?.grade
  const fund     = ltResult?.fundamentalsData
  const analysts = analystSentiment(fund)

  const action      = swGrade
    ? (ACTION_MATRIX[`${ltGrade}|${swGrade}`] ?? ACTION_LT_ONLY[ltGrade] ?? 'Monitor position')
    : (ACTION_LT_ONLY[ltGrade] ?? 'Monitor position')

  const confidence   = calcConfidence(ltResult, swResult, alignment)
  const because      = buildBecause(ltResult, swResult, alignment, analysts)
  const invalidation = buildInvalidation(action, ltResult, swResult)

  return {
    action, color:decisionColor(action),
    confidence, because, invalidation,
    analysts, swingUsed:!!swResult,
    ltGrade, swGrade, alignment,
  }
}
