/**
 * MODULE: VIEWS / CompareView.jsx
 * Side-by-side comparison of two tickers using the full conviction engine.
 * Runs both LT engines in parallel — no extra API calls beyond what's cached.
 */

import { useState } from 'react'
import { ArrowLeftRight, X }   from 'lucide-react'
import { useConviction }        from '../hooks/useConviction.js'
import { runSwingConviction }   from '../conviction/index.js'
import { computeDecision }      from '../conviction/decision/engine.js'
import ConvictionRing            from '../components/ui/ConvictionRing.jsx'

/* ── Grade color helper ────────────────────────────────────── */
const GRADE_COLOR = {
  'STRONG BUY':  '#22C55E', 'BUY': '#86EFAC',
  'HOLD': '#FBBF24', 'SELL': '#F97316', 'STRONG SELL': '#EF4444',
}
const gc = g => GRADE_COLOR[g] ?? 'var(--txt-muted)'

/* ── Components ─────────────────────────────────────────────── */
const COMPS = [
  { key: 'growth',    label: 'Growth',    max: 25 },
  { key: 'quality',   label: 'Quality',   max: 20 },
  { key: 'strength',  label: 'Strength',  max: 15 },
  { key: 'valuation', label: 'Valuation', max: 15 },
  { key: 'technical', label: 'Technical', max: 15 },
]

/* ── Ticker input ────────────────────────────────────────────── */
function TickerInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6))}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px', fontFamily: 'var(--mono)',
        fontSize: 18, fontWeight: 800, letterSpacing: '0.04em', textAlign: 'center',
        background: 'var(--surface-up)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', color: 'var(--txt)', outline: 'none',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
      onBlur={e => e.target.style.borderColor = 'var(--border)'}
    />
  )
}

/* ── Single ticker column ────────────────────────────────────── */
function TickerColumn({ ticker, result, loading, otherResult, side }) {
  if (!ticker) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--txt-muted)', fontSize: 12, minHeight: 200 }}>
      Enter a ticker above
    </div>
  )

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--txt-muted)', fontSize: 12, minHeight: 200 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>
        Running engines…
      </div>
    </div>
  )

  if (!result) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--txt-muted)', fontSize: 12, minHeight: 200 }}>
      No data
    </div>
  )

  // Compute swing for this ticker
  const ohlcv    = result.ohlcv    ?? []
  const spyOhlcv = result.spyOhlcv ?? []
  let swing = null
  try { swing = runSwingConviction(result.fundamentalsData, ohlcv, spyOhlcv) } catch {}

  // Decision engine
  let decision = null
  try {
    const RANK = { 'STRONG BUY':4,'BUY':3,'HOLD':2,'SELL':1,'STRONG SELL':0 }
    let alignment_ = null
    if (swing) {
      const ltR = RANK[result.grade]??2, swR = RANK[swing.grade]??2
      const ceil = [100,75,50,25,0][Math.min(Math.abs(ltR-swR),4)]
      const sim  = Math.max(0, 100-Math.abs(result.finalScore-swing.finalScore))
      alignment_ = Math.min(sim, ceil)
    }
    decision = computeDecision(result, swing, alignment_)
  } catch {}

  const color = gc(result.grade)
  const isWinner = otherResult && result.finalScore > otherResult.finalScore

  return (
    <div style={{ flex: 1 }}>
      {/* Score ring + grade */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '16px 0 12px', borderBottom: '1px solid var(--border)' }}>
        <ConvictionRing score={result.finalScore} grade={result.grade} size={64} />
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color, padding: '2px 10px',
            background: `${color}18`, borderRadius: 'var(--radius)', letterSpacing: '0.04em' }}>
            {result.grade}
          </span>
          {isWinner && (
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)',
              background: 'var(--green-dim)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>
              HIGHER
            </span>
          )}
        </div>
        {result.confidence != null && (
          <div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 4 }}>
            {result.confidence}% confidence
          </div>
        )}
      </div>

      {/* Component bars */}
      <div style={{ padding: '10px 0' }}>
        {COMPS.map(c => {
          const score   = result.breakdown?.[c.key]?.score ?? 0
          const other   = otherResult?.breakdown?.[c.key]?.score ?? 0
          const pct     = Math.min((score / c.max) * 100, 100)
          const winning = otherResult && score > other
          const losing  = otherResult && score < other
          const barColor = winning ? 'var(--green)' : losing ? 'var(--red)' : 'var(--accent)'
          return (
            <div key={c.key} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--txt-muted)' }}>{c.label}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                  color: winning ? 'var(--green)' : losing ? 'var(--red)' : 'var(--txt)' }}>
                  {score}/{c.max}
                  {winning && ' ▲'}{losing && ' ▼'}
                </span>
              </div>
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${pct}%`,
                  background: barColor, borderRadius: 3,
                  transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )
        })}

        {/* Risk penalty */}
        {result.riskPenalty != null && result.riskPenalty !== 0 && (
          <div style={{ marginTop: 6, padding: '4px 0', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--txt-muted)' }}>Risk Penalty</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--red)' }}>
              {result.riskPenalty}
            </span>
          </div>
        )}
      </div>

      {/* Swing score */}
      {swing && (
        <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--txt-muted)', textTransform: 'uppercase',
              letterSpacing: '0.06em' }}>Swing</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 800,
                color: gc(swing.grade) }}>{swing.finalScore}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: gc(swing.grade),
                padding: '1px 6px', background: `${gc(swing.grade)}18`, borderRadius: 'var(--radius)' }}>
                {swing.grade}
              </span>
            </div>
          </div>
          {swing.setup && (
            <div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 3 }}>
              {swing.setup}
            </div>
          )}
        </div>
      )}

      {/* Key fundamentals */}
      <div style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
        {[
          ['Upside',   result.wallStreet?.upside != null ? `+${result.wallStreet.upside.toFixed(1)}%` : '—'],
          ['Analysts', result.wallStreet?.analysts ?? '—'],
          ['Gate',     result.activeGate || 'None'],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
            marginBottom: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--txt-muted)' }}>{label}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--txt)',
              fontWeight: label === 'Gate' && val !== 'None' ? 700 : 400 }}>
              {val}
            </span>
          </div>
        ))}
      </div>

      {/* Decision */}
      {decision && (
        <div style={{ padding: '8px', background: `${decision.color}14`,
          border: `1px solid ${decision.color}33`, borderRadius: 'var(--radius-lg)', marginTop: 4 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: decision.color,
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
            Decision
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>
            {decision.action}
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 2 }}>
            {decision.phase}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main view ───────────────────────────────────────────────── */
export default function CompareView() {
  const [tickerA, setTickerA] = useState('')
  const [tickerB, setTickerB] = useState('')
  const [runA, setRunA] = useState('')
  const [runB, setRunB] = useState('')

  const { result: resultA, loading: loadingA } = useConviction(runA)
  const { result: resultB, loading: loadingB } = useConviction(runB)

  const handleCompare = () => {
    if (tickerA) setRunA(tickerA)
    if (tickerB) setRunB(tickerB)
  }

  const handleSwap = () => {
    const a = tickerA, b = tickerB
    setTickerA(b); setTickerB(a)
    setRunA(runB); setRunB(runA)
  }

  // Summary winner line
  const hasBoth = resultA && resultB
  const winner  = hasBoth ? (resultA.finalScore > resultB.finalScore ? runA : runB) : null
  const margin  = hasBoth ? Math.abs(resultA.finalScore - resultB.finalScore) : 0
  const sameGrade = hasBoth && resultA.grade === resultB.grade

  return (
    <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <ArrowLeftRight size={18} color="var(--accent)" />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>Compare Stocks</span>
      </div>

      {/* Inputs */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <TickerInput value={tickerA} onChange={setTickerA} placeholder="NVDA" />
        </div>

        <button onClick={handleSwap} title="Swap tickers"
          style={{ width: 36, height: 36, borderRadius: 'var(--radius)', flexShrink: 0,
            border: '1px solid var(--border)', background: 'var(--surface-up)',
            cursor: 'pointer', color: 'var(--txt-muted)', display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeftRight size={14} />
        </button>

        <div style={{ flex: 1 }}>
          <TickerInput value={tickerB} onChange={setTickerB} placeholder="AVGO" />
        </div>

        <button onClick={handleCompare}
          disabled={!tickerA || !tickerB}
          style={{ padding: '10px 18px', borderRadius: 'var(--radius)', flexShrink: 0,
            border: 'none', background: (!tickerA || !tickerB) ? 'var(--border)' : 'var(--accent)',
            color: (!tickerA || !tickerB) ? 'var(--txt-muted)' : '#fff',
            cursor: (!tickerA || !tickerB) ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.03em' }}>
          Compare
        </button>
      </div>

      {/* Summary banner */}
      {hasBoth && (
        <div style={{ padding: '10px 14px', background: 'var(--surface-up)',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', marginBottom: 14 }}>
          {sameGrade ? (
            <span style={{ fontSize: 11, color: 'var(--txt)' }}>
              Both rated <b>{resultA.grade}</b>
              {margin > 0 && <> — {winner} leads by <b>{margin} pts</b></>}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--txt)' }}>
              <b style={{ color: gc(winner === runA ? resultA.grade : resultB.grade) }}>{winner}</b>
              {' '}scores higher by <b>{margin} pts</b>
              {' '}({winner === runA ? resultA.grade : resultB.grade} vs {winner === runA ? resultB.grade : resultA.grade})
            </span>
          )}
        </div>
      )}

      {/* Side-by-side columns */}
      {(runA || runB) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
          background: 'var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

          {/* Ticker A column */}
          <div style={{ background: 'var(--surface)', padding: '0 14px 14px' }}>
            <div style={{ padding: '10px 0 6px', fontFamily: 'var(--mono)', fontSize: 16,
              fontWeight: 800, color: 'var(--txt)', letterSpacing: '0.04em' }}>
              {runA || '—'}
            </div>
            <TickerColumn
              ticker={runA} result={resultA} loading={loadingA}
              otherResult={resultB} side="A"
            />
          </div>

          {/* Ticker B column */}
          <div style={{ background: 'var(--surface)', padding: '0 14px 14px' }}>
            <div style={{ padding: '10px 0 6px', fontFamily: 'var(--mono)', fontSize: 16,
              fontWeight: 800, color: 'var(--txt)', letterSpacing: '0.04em' }}>
              {runB || '—'}
            </div>
            <TickerColumn
              ticker={runB} result={resultB} loading={loadingB}
              otherResult={resultA} side="B"
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!runA && !runB && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--txt-muted)' }}>
          <ArrowLeftRight size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontSize: 13 }}>Enter two tickers and press Compare</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            Runs both conviction engines in parallel
          </div>
        </div>
      )}
    </div>
  )
}
EOSX
echo "CompareView.jsx created"