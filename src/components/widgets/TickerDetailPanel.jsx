/**
 * MODULE: WIDGETS / TickerDetailPanel.jsx
 * Slide-in fundamentals panel for a selected ticker.
 *
 * Sections:
 *  · Price + Analyst consensus bar
 *  · Growth  (Revenue, EPS, FCF, beats)
 *  · Quality (ROE, ROIC, Margins)
 *  · Strength (D/E, Current Ratio, Interest Coverage)
 *  · Valuation (P/E, PEG, EV/EBITDA, P/FCF, Beta)
 *  · Data Freshness + Refresh button
 */

import { X, RotateCcw, TrendingUp, Shield, BarChart2, DollarSign, Clock } from 'lucide-react'
import { useFundamentals }  from '../../hooks/useFundamentals.js'
import { useBreakpoint }    from '../../hooks/useBreakpoint.js'
import { POSITIONS }        from '../../data/positions.js'
import { fUSD, fPct, fPctVal, fMult, fBig, fRatio } from '../../utils/format.js'

/* ── Color coding helpers ───────────────────────────────── */
function growthColor(v) {
  if (v == null) return 'var(--txt-muted)'
  const p = v * 100
  if (p >= 20) return 'var(--green)'
  if (p >= 5)  return 'var(--amber)'
  return 'var(--red)'
}
function marginColor(v) {
  if (v == null) return 'var(--txt-muted)'
  const p = v * 100
  if (p >= 30) return 'var(--green)'
  if (p >= 10) return 'var(--amber)'
  return 'var(--red)'
}
function peColor(v) {
  if (v == null) return 'var(--txt-muted)'
  if (v < 20)  return 'var(--green)'
  if (v < 40)  return 'var(--amber)'
  return 'var(--red)'
}
function roeColor(v) {
  if (v == null) return 'var(--txt-muted)'
  const p = v * 100
  if (p >= 20) return 'var(--green)'
  if (p >= 10) return 'var(--amber)'
  return 'var(--red)'
}
function debtColor(v) {
  if (v == null) return 'var(--txt-muted)'
  if (v < 0.5) return 'var(--green)'
  if (v < 1.5) return 'var(--amber)'
  return 'var(--red)'
}
function beatsColor(n) {
  if (n == null) return 'var(--txt-muted)'
  if (n >= 4)  return 'var(--green)'
  if (n >= 2)  return 'var(--amber)'
  return 'var(--red)'
}

/* ── Section header ─────────────────────────────────────── */
function SectionHeader({ icon: Icon, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      fontSize: 10, fontWeight: 700, color: 'var(--txt-muted)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginTop: 18, marginBottom: 8,
      paddingBottom: 6, borderBottom: '1px solid var(--border)',
    }}>
      <Icon size={12} />
      {label}
    </div>
  )
}

/* ── Data row ────────────────────────────────────────────── */
function Row({ label, value, color, sub }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '5px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--txt-sec)' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
          color: color || 'var(--txt)',
        }}>
          {value ?? '—'}
        </span>
        {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt-muted)' }}>{sub}</div>}
      </div>
    </div>
  )
}

/* ── Analyst consensus bar ──────────────────────────────── */
function ConsensusBar({ sb, b, h, s, ss }) {
  const total = (sb + b + h + s + ss) || 1
  const pct   = n => `${(n / total * 100).toFixed(1)}%`
  const items = [
    { n: sb, color: '#22C55E',   label: 'Strong Buy' },
    { n: b,  color: '#86EFAC',   label: 'Buy'        },
    { n: h,  color: '#FBBF24',   label: 'Hold'       },
    { n: s,  color: '#F97316',   label: 'Sell'       },
    { n: ss, color: '#EF4444',   label: 'Strong Sell'},
  ]
  return (
    <div>
      {/* Bar */}
      <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 8, gap: 1 }}>
        {items.map(({ n, color, label }) => n > 0 && (
          <div key={label} title={`${label}: ${n}`}
            style={{ width: pct(n), background: color, minWidth: n > 0 ? 2 : 0 }} />
        ))}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {items.map(({ n, color, label }) => (
          <div key={label} style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color }}>{n}</div>
            <div style={{ fontSize: 9, color: 'var(--txt-muted)', letterSpacing: '0.03em' }}>
              {label.split(' ')[label.split(' ').length - 1]}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Data Freshness ─────────────────────────────────────── */
function FreshnessRow({ label, freshness }) {
  if (!freshness) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--txt-sec)' }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--txt-muted)' }}>Not cached</span>
      </div>
    )
  }
  const color = freshness.daysLeft > 30 ? 'var(--green)' : freshness.daysLeft > 0 ? 'var(--amber)' : 'var(--red)'
  const icon  = freshness.daysLeft > 30 ? '✅' : freshness.daysLeft > 0 ? '⚠️' : '🔴'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--txt-sec)' }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color }}>
        {icon} {freshness.daysSince}d ago · {freshness.daysLeft}d left
      </span>
    </div>
  )
}

/* ── Main panel ─────────────────────────────────────────── */
export default function TickerDetailPanel({ ticker, onClose, prices = {} }) {
  const { isMobile } = useBreakpoint()
  const { data, loading, error, freshness, refresh } = useFundamentals(ticker)
  const pos       = POSITIONS.find(p => p.ticker === ticker)
  const livePrice = prices[ticker]?.price ?? pos?.currentPrice ?? 0

  // Upside from analyst target
  const upside = (data?.targetMean && livePrice)
    ? ((data.targetMean / livePrice) - 1) * 100
    : null

  const panelStyle = {
    position:  'fixed',
    top:       0,
    right:     0,
    width:     isMobile ? '100vw' : 420,
    height:    '100vh',
    background:   'var(--surface)',
    borderLeft:   isMobile ? 'none' : '1px solid var(--border)',
    zIndex:    150,
    display:   'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 149,
        background: 'rgba(0,0,0,0.3)',
      }} />

      {/* Panel */}
      <div style={panelStyle}>
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          background: 'var(--surface)',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--txt)' }}>
              {ticker}
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{pos?.name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={refresh} disabled={loading} title="Refresh fundamentals"
              style={{
                width: 32, height: 32, borderRadius: 8,
                border: '1px solid var(--border)', background: 'transparent',
                cursor: loading ? 'wait' : 'pointer',
                color: loading ? 'var(--accent)' : 'var(--txt-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: loading ? 'tp-spin 1s linear infinite' : 'none',
              }}>
              <RotateCcw size={14} />
            </button>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid var(--border)', background: 'transparent',
              cursor: 'pointer', color: 'var(--txt-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Spin animation */}
        <style>{`@keyframes tp-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

        {/* ── Body ── */}
        <div style={{ padding: '14px 16px', flex: 1 }}>

          {/* Loading state */}
          {loading && !data && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--txt-muted)', fontSize: 13 }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>↻</div>
              Fetching fundamentals from Finnhub + FMP…<br />
              <span style={{ fontSize: 11 }}>First scan — caching for 90 days</span>
            </div>
          )}

          {/* Error state */}
          {error && !data && (
            <div style={{
              background: 'var(--red-dim)', border: '1px solid var(--red)',
              borderRadius: 8, padding: '12px', marginBottom: 16,
              fontSize: 12, color: 'var(--red)',
            }}>
              ⚠ {error}
            </div>
          )}

          {/* ── Price + Analyst ── */}
          {(data || livePrice) && (
            <>
              <div style={{
                background: 'var(--surface-up)', borderRadius: 10,
                padding: '14px', marginBottom: 4,
              }}>
                {/* Price row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--txt)' }}>
                      {fUSD(livePrice)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--txt-muted)', marginTop: 2 }}>Current price</div>
                  </div>
                  {data?.targetMean && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                        {fUSD(data.targetMean)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>Analyst target</div>
                    </div>
                  )}
                </div>

                {/* Upside */}
                {upside != null && (
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, marginBottom: 10,
                    color: upside >= 0 ? 'var(--green)' : 'var(--red)',
                  }}>
                    {upside >= 0 ? '▲' : '▼'} {fPct(Math.abs(upside))} analyst upside
                    {data?.targetLow && data?.targetHigh && (
                      <span style={{ fontSize: 11, color: 'var(--txt-muted)', fontWeight: 400, marginLeft: 8 }}>
                        ({fUSD(data.targetLow)} – {fUSD(data.targetHigh)})
                      </span>
                    )}
                  </div>
                )}

                {/* Consensus bar */}
                {data && (data.strongBuy + data.buy + data.hold + data.sell + data.strongSell) > 0 && (
                  <ConsensusBar
                    sb={data.strongBuy} b={data.buy}
                    h={data.hold} s={data.sell} ss={data.strongSell}
                  />
                )}
              </div>

              {/* ── Growth ── */}
              {data && (
                <>
                  <SectionHeader icon={TrendingUp} label="Growth" />
                  <Row label="Revenue Growth YoY" value={fPctVal(data.revenueGrowthYoY)} color={growthColor(data.revenueGrowthYoY)} />
                  <Row label="Revenue Growth 3Y"  value={fPctVal(data.revenueGrowth3Y)}  color={growthColor(data.revenueGrowth3Y)} />
                  <Row label="Revenue Growth 5Y"  value={fPctVal(data.revenueGrowth5Y)}  color={growthColor(data.revenueGrowth5Y)} />
                  <Row label="EPS Growth YoY"     value={fPctVal(data.epsGrowthYoY)}     color={growthColor(data.epsGrowthYoY)} />
                  <Row label="EPS Growth 3Y"      value={fPctVal(data.epsGrowth3Y)}      color={growthColor(data.epsGrowth3Y)} />
                  <Row label="FCF (TTM)"          value={fBig(data.fcfTTM)} />
                  <Row label="FCF Growth 5Y"      value={fPctVal(data.fcfGrowth5Y)}      color={growthColor(data.fcfGrowth5Y)} />
                  <Row
                    label="Earnings Beats"
                    value={data.consecutiveBeats != null ? `${data.consecutiveBeats} consecutive` : '—'}
                    color={beatsColor(data.consecutiveBeats)}
                    sub={data.epsSurprisePct != null ? `Last: ${data.epsSurprisePct >= 0 ? '+' : ''}${data.epsSurprisePct?.toFixed(1)}%` : null}
                  />

                  {/* ── Quality ── */}
                  <SectionHeader icon={Shield} label="Quality" />
                  <Row label="ROE"              value={fPctVal(data.roe)}            color={roeColor(data.roe)} />
                  <Row label="ROIC"             value={fPctVal(data.roic)}           color={roeColor(data.roic)} sub="via FMP" />
                  <Row label="Gross Margin"     value={fPctVal(data.grossMargin)}    color={marginColor(data.grossMargin)} />
                  <Row label="Operating Margin" value={fPctVal(data.operatingMargin)} color={marginColor(data.operatingMargin)} />
                  <Row label="Net Margin"       value={fPctVal(data.netMargin)}      color={marginColor(data.netMargin)} />

                  {/* ── Strength ── */}
                  <SectionHeader icon={BarChart2} label="Financial Strength" />
                  <Row label="Debt / Equity"      value={fRatio(data.debtToEquity)}  color={debtColor(data.debtToEquity)} />
                  <Row label="Current Ratio"      value={fRatio(data.currentRatio)}
                    color={data.currentRatio > 1.5 ? 'var(--green)' : data.currentRatio > 1 ? 'var(--amber)' : 'var(--red)'} />
                  <Row label="Interest Coverage"  value={data.interestCoverage ? `${fRatio(data.interestCoverage)}×` : '—'}
                    color={data.interestCoverage > 5 ? 'var(--green)' : data.interestCoverage > 2 ? 'var(--amber)' : 'var(--red)'} />

                  {/* ── Valuation ── */}
                  <SectionHeader icon={DollarSign} label="Valuation" />
                  <Row label="P/E"       value={fMult(data.pe)}      color={peColor(data.pe)} />
                  <Row label="PEG"       value={fRatio(data.peg, 2)} color={data.peg ? (data.peg < 1 ? 'var(--green)' : data.peg < 2 ? 'var(--amber)' : 'var(--red)') : 'var(--txt-muted)'} sub="via FMP" />
                  <Row label="EV/EBITDA" value={fMult(data.evEbitda)} />
                  <Row label="P/FCF"     value={fMult(data.pFcf)} />
                  <Row label="Beta"      value={fRatio(data.beta, 2)}
                    color={data.beta ? (data.beta < 1 ? 'var(--green)' : data.beta < 1.5 ? 'var(--amber)' : 'var(--red)') : 'var(--txt-muted)'} />

                  {/* ── Data Freshness ── */}
                  <SectionHeader icon={Clock} label="Data Freshness" />
                  <FreshnessRow label="Fundamentals (90d TTL)" freshness={freshness} />
                  <div style={{ marginTop: 12, fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.6 }}>
                    Sources: Finnhub (growth, quality, strength, valuation, consensus) + FMP (ROIC, PEG, beats)
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ height: 24 }} />
        </div>
      </div>
    </>
  )
}
