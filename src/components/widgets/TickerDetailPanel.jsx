/**
 * MODULE: WIDGETS / TickerDetailPanel.jsx
 * Full conviction analysis panel for a selected ticker.
 *
 * Sections (top → bottom):
 *  1. Conviction Score + Grade + Confidence
 *  2. Dimension breakdown bars (Growth/Quality/Strength/Valuation/Technical/Risk)
 *  3. Gates status
 *  4. Consensus Wall St. (FMP price target + Finnhub ratings)
 *  5. Fundamentals detail (Growth / Quality / Strength / Valuation / RS vs SPY)
 *  6. Data Freshness
 *
 * Uses useConviction — one hook, one call, everything included.
 */

import { useEffect }     from 'react'
import { X, RotateCcw, TrendingUp, Shield, BarChart2, DollarSign, Clock, Target } from 'lucide-react'
import { useConviction }  from '../../hooks/useConviction.js'
import { useBreakpoint }  from '../../hooks/useBreakpoint.js'
import { POSITIONS }      from '../../data/positions.js'
import { fUSD, fPct, fPctRaw, fMult, fBig, fRatio } from '../../utils/format.js'
import { cache }          from '../../utils/cache.js'

/* ── Color helpers (values in % form from Finnhub) ─────── */
const growthColor  = v => v == null ? 'var(--txt-muted)' : v >= 20 ? 'var(--green)' : v >= 5 ? 'var(--amber)' : 'var(--red)'
const marginColor  = v => v == null ? 'var(--txt-muted)' : v >= 30 ? 'var(--green)' : v >= 10 ? 'var(--amber)' : 'var(--red)'
const roeColor     = v => v == null ? 'var(--txt-muted)' : v >= 20 ? 'var(--green)' : v >= 10 ? 'var(--amber)' : 'var(--red)'
const debtColor    = v => v == null ? 'var(--txt-muted)' : v < 0.5 ? 'var(--green)' : v < 1.5 ? 'var(--amber)' : 'var(--red)'
const peColor      = v => v == null ? 'var(--txt-muted)' : v < 20 ? 'var(--green)' : v < 40 ? 'var(--amber)' : 'var(--red)'
const pegColor     = v => v == null ? 'var(--txt-muted)' : v < 1 ? 'var(--green)' : v < 2 ? 'var(--amber)' : 'var(--red)'
const rsColor      = v => v == null ? 'var(--txt-muted)' : v >= 0 ? 'var(--green)' : 'var(--red)'

/* ── Dimension bar ──────────────────────────────────────── */
function DimBar({ label, score, max, color }) {
  const pct  = score != null ? Math.min((score / max) * 100, 100) : 0
  const col  = color ?? 'var(--accent)'
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <span style={{ fontSize:11, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>{label}</span>
        <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, color: score != null ? col : 'var(--txt-muted)' }}>
          {score != null ? score.toFixed(score % 1 === 0 ? 0 : 1) : '—'}<span style={{ color:'var(--txt-muted)', fontWeight:400 }}>/{max}</span>
        </span>
      </div>
      <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:3, transition:'width 0.4s ease' }} />
      </div>
    </div>
  )
}

/* ── Data row ───────────────────────────────────────────── */
function Row({ label, value, color, sub }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:12, color:'var(--txt-sec)' }}>{label}</span>
      <div style={{ textAlign:'right' }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:600, color: color || 'var(--txt)' }}>{value ?? '—'}</span>
        {sub && <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--txt-muted)' }}>{sub}</div>}
      </div>
    </div>
  )
}

/* ── Section header ─────────────────────────────────────── */
function SectionHeader({ icon: Icon, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:18, marginBottom:8, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>
      <Icon size={12} />{label}
    </div>
  )
}

/* ── Consensus bar ──────────────────────────────────────── */
function ConsensusBar({ sb=0, b=0, h=0, s=0, ss=0 }) {
  const total = sb+b+h+s+ss || 1
  const pct = n => `${(n/total*100).toFixed(1)}%`
  const items = [
    {n:sb,color:'#22C55E',label:'Strong Buy'},
    {n:b, color:'#86EFAC',label:'Buy'},
    {n:h, color:'#FBBF24',label:'Hold'},
    {n:s, color:'#F97316',label:'Sell'},
    {n:ss,color:'#EF4444',label:'Strong Sell'},
  ]
  return (
    <div>
      <div style={{ display:'flex', height:7, borderRadius:4, overflow:'hidden', marginBottom:8, gap:1 }}>
        {items.map(({n,color,label}) => n > 0 &&
          <div key={label} title={`${label}: ${n}`} style={{ width:pct(n), background:color, minWidth:2 }} />
        )}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between' }}>
        {items.map(({n,color,label}) => (
          <div key={label} style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color }}>{n}</div>
            <div style={{ fontSize:9, color:'var(--txt-muted)' }}>{label.split(' ').pop()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Freshness row ──────────────────────────────────────── */
function FreshnessRow({ label, freshness }) {
  if (!freshness) return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:12, color:'var(--txt-sec)' }}>{label}</span>
      <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--txt-muted)' }}>Not cached</span>
    </div>
  )
  const color = freshness.daysLeft > 30 ? 'var(--green)' : freshness.daysLeft > 0 ? 'var(--amber)' : 'var(--red)'
  const icon  = freshness.daysLeft > 30 ? '✅' : freshness.daysLeft > 0 ? '⚠️' : '🔴'
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:12, color:'var(--txt-sec)' }}>{label}</span>
      <span style={{ fontSize:11, fontFamily:'var(--mono)', color }}>{icon} {freshness.daysSince}d ago · {freshness.daysLeft}d left</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   MAIN PANEL
═══════════════════════════════════════════════════════ */
export default function TickerDetailPanel({ ticker, onClose, prices = {}, embedded = false, onResult }) {
  const { isMobile } = useBreakpoint()
  const { result, loading, error, recompute } = useConviction(ticker, prices)

  const pos     = POSITIONS.find(p => p.ticker === ticker)
  const f       = result?.fundamentalsData ?? null
  const freshness = cache.infoFund(ticker)

  return (
    <>
      {/* Backdrop — only in overlay mode */}
      {!embedded && <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:149, background:'rgba(0,0,0,0.3)' }} />}

      {/* Panel */}
      <div style={embedded ? {
        flex:1, display:'flex', flexDirection:'column',
        overflowY:'auto', minWidth:0,
      } : {
        position:'fixed', top:0, right:0,
        width: isMobile ? '100vw' : 440,
        height:'100vh',
        background:'var(--surface)',
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
        zIndex:150, display:'flex', flexDirection:'column',
        overflowY:'auto',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.4)',
      }}>
        {/* ── Header ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--surface)', position:'sticky', top:0, zIndex:10 }}>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color:'var(--txt)' }}>{ticker}</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{pos?.name}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={recompute} disabled={loading} title="Recompute conviction"
              style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:loading ? 'wait' : 'pointer', color:loading ? 'var(--accent)' : 'var(--txt-muted)', display:'flex', alignItems:'center', justifyContent:'center', animation:loading ? 'tp-spin 1s linear infinite' : 'none' }}>
              <RotateCcw size={14} />
            </button>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', color:'var(--txt-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <style>{`@keyframes tp-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

        {/* ── Body ── */}
        <div style={{ padding:'14px 16px', flex:1 }}>

          {/* Loading */}
          {loading && !result && (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--txt-muted)', fontSize:13 }}>
              <div style={{ fontSize:24, marginBottom:12 }}>↻</div>
              Computing conviction score…<br />
              <span style={{ fontSize:11 }}>Fetching fundamentals + OHLCV + SPY</span>
            </div>
          )}

          {/* Error */}
          {error && !result && (
            <div style={{ background:'var(--red-dim)', border:'1px solid var(--red)', borderRadius:8, padding:'12px', marginBottom:16, fontSize:12, color:'var(--red)' }}>
              ⚠ {error}
            </div>
          )}

          {result && (
            <>
              {/* ══ SECTION 1: CONVICTION SCORE ══ */}
              <div style={{ background:result.gradeBg, border:`1px solid ${result.gradeColor}33`, borderRadius:12, padding:'16px', marginBottom:16 }}>
                {/* Score + Grade + Confidence */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                      <span style={{ fontFamily:'var(--mono)', fontSize:42, fontWeight:700, color:result.gradeColor, lineHeight:1, letterSpacing:'-0.04em' }}>
                        {result.finalScore}
                      </span>
                      <span style={{ fontFamily:'var(--mono)', fontSize:14, color:'var(--txt-muted)' }}>/100</span>
                    </div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color:result.gradeColor, marginTop:4 }}>
                      {'★'.repeat(result.gradeStars)}{'☆'.repeat(5 - result.gradeStars)} {result.grade}
                    </div>
                    {result.activeGate && (
                      <div style={{ fontSize:11, color:'var(--amber)', marginTop:4 }}>
                        ⚠ {result.activeGate === 'gate1' ? 'Gate 1' : 'Gate 2'} active — capped at {result.gateCap}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:10, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Confidence</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:26, fontWeight:700, color:'var(--txt)' }}>
                      {result.confidence}<span style={{ fontSize:14, color:'var(--txt-muted)' }}>%</span>
                    </div>
                  </div>
                </div>

                {/* Score pipeline (for transparency) */}
                <div style={{ fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)', marginBottom:14 }}>
                  Raw {result.rawScore} · Risk {result.riskPenalty} → {result.scoreAfterRisk}
                  {result.gateCap ? ` → Gate cap ${result.gateCap}` : ''} → <strong style={{ color:result.gradeColor }}>{result.finalScore}</strong>
                </div>

                {/* Dimension bars */}
                <DimBar label="Growth"    score={result.breakdown.growth.score}    max={25} color={result.gradeColor} />
                <DimBar label="Quality"   score={result.breakdown.quality.score}   max={20} color={result.gradeColor} />
                <DimBar label="Strength"  score={result.breakdown.strength.score}  max={15} color={result.gradeColor} />
                <DimBar label="Valuation" score={result.breakdown.valuation.score} max={15}
                  color={result.gradeColor}/>
                <DimBar label="Technical" score={result.breakdown.technical.score} max={15} color={result.gradeColor} />

                {/* Risk penalty */}
                {result.riskPenalty < 0 && (
                  <div style={{ marginTop:8, fontSize:11, color:'var(--red)', fontFamily:'var(--mono)' }}>
                    Risk penalty {result.riskPenalty}: {result.breakdown.risk.breakdown.map(r => r.label).join(' · ')}
                  </div>
                )}

                {/* Valuation metric used */}
                <div style={{ marginTop:8, fontSize:10, color:'var(--txt-muted)' }}>
                  Valuation metric: <strong>{result.breakdown.valuation.metric ?? '—'}</strong>
                  {result.breakdown.valuation.value != null ? ` (${result.breakdown.valuation.value.toFixed(2)})` : ''}
                </div>
              </div>

              {/* ══ SECTION 2: GATES ══ */}
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                {[
                  { label:'Gate 1', g:result.gates.gate1 },
                  { label:'Gate 2', g:result.gates.gate2 },
                ].map(({label, g}) => (
                  <div key={label} style={{
                    flex:1, padding:'8px 12px', borderRadius:8,
                    border:`1px solid ${g.skipped ? 'var(--border)' : g.pass ? 'var(--green)' : 'var(--red)'}`,
                    background: g.skipped ? 'transparent' : g.pass ? 'var(--green-dim)' : 'var(--red-dim)',
                    textAlign:'center',
                  }}>
                    <div style={{ fontSize:10, color:'var(--txt-muted)', marginBottom:2 }}>{label}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700,
                      color: g.skipped ? 'var(--txt-muted)' : g.pass ? 'var(--green)' : 'var(--red)' }}>
                      {g.skipped ? '—' : g.pass ? '✓ PASS' : '✗ FAIL'}
                    </div>
                  </div>
                ))}
              </div>

              {/* ══ SECTION 3: CONSENSUS WALL ST. ══ */}
              {(result.wallStreet.targetMean || result.wallStreet.analysts > 0) && (
                <div style={{ background:'var(--surface-up)', borderRadius:10, padding:'14px', marginBottom:4 }}>
                  <div style={{ fontSize:10, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.07em', fontWeight:600, marginBottom:10 }}>
                    Consensus Wall St.
                  </div>

                  {result.wallStreet.targetMean && (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:22, fontWeight:700, color:'var(--accent)' }}>
                            {fUSD(result.wallStreet.targetMean)}
                          </div>
                          {result.wallStreet.upside != null && (
                            <div style={{ fontFamily:'var(--mono)', fontSize:14, fontWeight:700, color: result.wallStreet.upside >= 0 ? 'var(--green)' : 'var(--red)', marginTop:2 }}>
                              {result.wallStreet.upside >= 0 ? '▲' : '▼'} {fPct(Math.abs(result.wallStreet.upside))} upside
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign:'right' }}>
                          {result.wallStreet.targetHigh && <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--txt-muted)' }}>H: {fUSD(result.wallStreet.targetHigh)}</div>}
                          {result.wallStreet.targetLow  && <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--txt-muted)' }}>L: {fUSD(result.wallStreet.targetLow)}</div>}
                          <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4 }}>{result.wallStreet.analysts} analysts</div>
                        </div>
                      </div>
                    </>
                  )}

                  {result.wallStreet.analysts > 0 && (
                    <ConsensusBar
                      sb={result.wallStreet.strongBuy} b={result.wallStreet.buy}
                      h={result.wallStreet.hold} s={result.wallStreet.sell}
                      ss={result.wallStreet.strongSell}
                    />
                  )}

                  {result.wallStreet.consecutiveBeats > 0 && (
                    <div style={{ marginTop:10, fontFamily:'var(--mono)', fontSize:12, color:'var(--green)' }}>
                      ✓ {result.wallStreet.consecutiveBeats} consecutive earnings beats
                      {result.wallStreet.lastEpsSurprise != null && (
                        <span style={{ color:'var(--txt-muted)' }}> · Last: {result.wallStreet.lastEpsSurprise >= 0 ? '+' : ''}{result.wallStreet.lastEpsSurprise.toFixed(1)}%</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ══ SECTIONS 4-6: FUNDAMENTALS DETAIL ══ */}
              {f && (
                <>
                  <SectionHeader icon={TrendingUp} label="Growth" />
                  <Row label="Revenue Growth YoY"  value={fPctRaw(f.revenueGrowthYoY)} color={growthColor(f.revenueGrowthYoY)} />
                  <Row label="Revenue Growth 3Y"   value={fPctRaw(f.revenueGrowth3Y)}  color={growthColor(f.revenueGrowth3Y)} />
                  <Row label="Revenue Growth 5Y"   value={fPctRaw(f.revenueGrowth5Y)}  color={growthColor(f.revenueGrowth5Y)} />
                  <Row label="EPS Growth YoY"      value={fPctRaw(f.epsGrowthYoY)}     color={growthColor(f.epsGrowthYoY)} />
                  <Row label="EPS Growth 3Y"       value={fPctRaw(f.epsGrowth3Y)}      color={growthColor(f.epsGrowth3Y)} />
                  <Row label="EPS Growth 5Y"       value={fPctRaw(f.epsGrowth5Y)}      color={growthColor(f.epsGrowth5Y)} />
                  <Row label="FCF (TTM)"           value={f.fcfTTM ? fBig(f.fcfTTM * 1_000_000) : '—'} />
                  <Row label="FCF CAGR 5Y"         value={fPctRaw(f.fcfGrowth5Y)}      color={growthColor(f.fcfGrowth5Y)} />
                  <Row label="EBITDA CAGR 5Y"      value={fPctRaw(f.ebitdaGrowth5Y)}   color={growthColor(f.ebitdaGrowth5Y)} />

                  <SectionHeader icon={Shield} label="Quality" />
                  <Row label="ROE"              value={fPctRaw(f.roe)}            color={roeColor(f.roe)} />
                  <Row label="ROI (ROIC proxy)" value={fPctRaw(f.roi)}            color={roeColor(f.roi)} />
                  <Row label="Gross Margin"     value={fPctRaw(f.grossMargin)}    color={marginColor(f.grossMargin)} />
                  <Row label="Operating Margin" value={fPctRaw(f.operatingMargin)} color={marginColor(f.operatingMargin)} />
                  <Row label="Net Margin"       value={fPctRaw(f.netMargin)}      color={marginColor(f.netMargin)} />

                  <SectionHeader icon={BarChart2} label="Financial Strength" />
                  <Row label="Debt / Equity"     value={f.debtToEquity != null ? fRatio(f.debtToEquity, 2) : '—'} color={debtColor(f.debtToEquity)} />
                  <Row label="Current Ratio"     value={f.currentRatio != null ? fRatio(f.currentRatio) : '—'}
                    color={f.currentRatio > 1.5 ? 'var(--green)' : f.currentRatio > 1 ? 'var(--amber)' : 'var(--red)'} />
                  <Row label="Interest Coverage" value={f.interestCoverage ? `${fRatio(f.interestCoverage)}×` : '—'}
                    color={f.interestCoverage > 5 ? 'var(--green)' : f.interestCoverage > 2 ? 'var(--amber)' : 'var(--red)'} />

                  <SectionHeader icon={DollarSign} label="Valuation" />
                  <Row label="P/E (TTM)"    value={fMult(f.pe)}          color={peColor(f.pe)} />
                  <Row label="Forward P/E"  value={fMult(f.forwardPE)}   color={peColor(f.forwardPE)} />
                  <Row label="PEG (TTM)"    value={fRatio(f.peg, 2)}     color={pegColor(f.peg)} />
                  <Row label="Forward PEG"  value={fRatio(f.forwardPEG, 2)} color={pegColor(f.forwardPEG)} />
                  <Row label="EV/EBITDA"    value={fMult(f.evEbitda)} />
                  <Row label="EV/FCF"       value={fMult(f.evFcf)} />
                  <Row label="P/FCF"        value={fMult(f.pFcf)} />
                  <Row label="Beta"         value={fRatio(f.beta, 2)}
                    color={f.beta ? (f.beta < 1 ? 'var(--green)' : f.beta < 1.5 ? 'var(--amber)' : 'var(--red)') : 'var(--txt-muted)'} />

                  <SectionHeader icon={TrendingUp} label="Relative Strength vs S&P 500" />
                  {result.technical.relStrength1M != null && <Row label="1 Month"   value={fPctRaw(result.technical.relStrength1M)}  color={rsColor(result.technical.relStrength1M)} />}
                  {result.technical.relStrength3M != null && <Row label="3 Months"  value={fPctRaw(result.technical.relStrength3M)} color={rsColor(result.technical.relStrength3M)} />}
                  {result.technical.relStrength6M != null && <Row label="6 Months"  value={fPctRaw(result.technical.relStrength6M)} color={rsColor(result.technical.relStrength6M)} />}
                  {result.technical.relStrengthWeighted != null && (
                    <Row label="Weighted avg" value={fPctRaw(result.technical.relStrengthWeighted)} color={rsColor(result.technical.relStrengthWeighted)} sub="1M×1 + 3M×2 + 6M×1.5" />
                  )}
                  {result.technical.rsi != null && <Row label="RSI (14)" value={fRatio(result.technical.rsi, 1)}
                    color={result.technical.rsi >= 40 && result.technical.rsi <= 60 ? 'var(--green)' : result.technical.rsi >= 30 && result.technical.rsi <= 70 ? 'var(--amber)' : 'var(--red)'} />}
                  {result.technical.ema200 != null && (
                    <Row label="EMA 200" value={fUSD(result.technical.ema200)}
                      sub={result.technical.aboveEMA200 ? 'Price above EMA ✓' : 'Price below EMA ✗'}
                      color={result.technical.aboveEMA200 ? 'var(--green)' : 'var(--red)'} />
                  )}

                  <SectionHeader icon={Clock} label="Data Freshness" />
                  <FreshnessRow label="Fundamentals (90d TTL)" freshness={freshness} />
                  <div style={{ marginTop:10, fontSize:11, color:'var(--txt-muted)', lineHeight:1.6 }}>
                    Sources: Finnhub (growth · quality · strength · valuation · consensus · earnings · RS)
                    + FMP (Consensus Wall St. target)
                    + Alpaca (OHLCV → EMA · RSI · Relative Strength)
                  </div>
                  <div style={{ marginTop:8, fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>
                    Sector profile: {result.sectorProfile} · Conviction model: TradePoint v1.0
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ height:24 }} />
        </div>
      </div>
    </>
  )
}
