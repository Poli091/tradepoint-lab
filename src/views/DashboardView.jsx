/**
 * MODULE: VIEWS / DashboardView.jsx
 * Main dashboard.
 *
 * Improvements (2026-07-11):
 *  - "Day P&L" StatCard replaces "Best Performer" (more actionable daily metric)
 *  - Upcoming earnings strip (next 3 events from calendar)
 *  - WatchlistPanel "⚙ Manage" wired to WatchlistEditor modal
 *  - WatchlistPanel item clicks now open TickerDetailPanel
 *  - PositionsTable has sortable Day % column
 */

import { useState, useMemo } from 'react'
import { Wallet, TrendingUp, CalendarDays, Zap } from 'lucide-react'
import StatCard            from '../components/ui/StatCard.jsx'
import PriceChart          from '../components/widgets/PriceChart.jsx'
import PositionsTable      from '../components/widgets/PositionsTable.jsx'
import WatchlistPanel      from '../components/widgets/WatchlistPanel.jsx'
import WatchlistEditor     from '../components/widgets/WatchlistEditor.jsx'
import TickerDetailPanel   from '../components/widgets/TickerDetailPanel.jsx'
import { useBreakpoint }   from '../hooks/useBreakpoint.js'
import { getGrade }        from '../conviction/grade/index.js'
import { fUSD, fPct, fSignedUSD } from '../utils/format.js'
import { loadEarnings }    from '../utils/earningsStorage.js'
import { loadWatchlist }   from '../utils/watchlistStorage.js'

const PAD = 14

/* ── Type pill for earnings strip ──────────────────── */
const TYPE_STYLE = {
  catalyst: { bg: 'rgba(99,102,241,0.15)', color: '#818CF8' },
  decision: { bg: 'rgba(251,191,36,0.15)', color: '#FCD34D' },
  critical: { bg: 'rgba(239,68,68,0.15)',  color: '#F87171' },
  monitor:  { bg: 'rgba(107,114,128,0.15)',color: 'var(--txt-muted)' },
}

/* ── Upcoming earnings strip ─────────────────────── */
function EarningsStrip({ onSelectTicker }) {
  const events = useMemo(() => {
    const raw = loadEarnings() ?? []
    const now = Date.now()
    return raw
      .map(ev => {
        const ms   = new Date(ev.date).getTime()
        const days = Math.ceil((ms - now) / 86400000)
        return { ...ev, days }
      })
      .filter(ev => ev.days >= 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, 4)
  }, [])

  if (!events.length) return null

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '12px 14px',
    }}>
      {/* Strip header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 10,
        fontSize: 10, fontWeight: 700, color: 'var(--txt-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <CalendarDays size={11} />
        Upcoming earnings
      </div>

      {/* Event cards — horizontal scroll on mobile */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
        {events.map(ev => {
          const ts    = TYPE_STYLE[ev.type] ?? TYPE_STYLE.monitor
          const label = ev.days === 0 ? 'Today' : ev.days === 1 ? 'Tomorrow' : `${ev.days}d`
          const date  = new Date(ev.date)
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <div
              key={ev.ticker + ev.date}
              onClick={() => onSelectTicker?.(ev.ticker)}
              style={{
                flex: '0 0 auto',
                minWidth: 110,
                background: 'var(--surface-up)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '8px 12px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>
                  {ev.ticker}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: ts.bg, color: ts.color,
                }}>
                  {ev.type?.toUpperCase()}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txt-muted)' }}>
                {dateStr}
              </div>
              <div style={{
                marginTop: 4,
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                color: ev.days === 0 ? 'var(--red)' : ev.days <= 7 ? 'var(--amber)' : 'var(--txt-sec)',
              }}>
                {label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main dashboard ──────────────────────────────── */
export default function DashboardView({
  visiblePositions, portfolioStats, prices = {},
  ticker, setTicker, range, setRange,
  sortBy, sortDir, handleSort,
  convictionResults = {}, convictionLoading = false,
  watchlistResults = {},
}) {
  const { isMobile } = useBreakpoint()
  const { totalValue, totalGain, gainPct } = portfolioStats
  const [detailOpen,          setDetailOpen]          = useState(false)
  const [watchlistEditorOpen, setWatchlistEditorOpen] = useState(false)
  const [watchlistSeed,       setWatchlistSeed]       = useState(0)

  /* ── Real avg conviction from engine ── */
  const liveConviction = useMemo(() => {
    const scores = Object.values(convictionResults)
      .map(r => r.finalScore)
      .filter(s => s != null)
    if (scores.length === 0) return null
    const avg   = Math.round(scores.reduce((a,b) => a+b,0) / scores.length * 10) / 10
    const grade = getGrade(avg)
    return { score: avg, label: grade.label, color: grade.color }
  }, [convictionResults])

  /* ── Day P&L from live positions ── */
  const dayPnL = useMemo(() => {
    const withData = visiblePositions.filter(p => p.dayChangePct != null)
    if (!withData.length) return null
    const dayDollar = withData.reduce((sum, p) => {
      const value = p.currentPrice * p.qty
      return sum + value * (p.dayChangePct / 100)
    }, 0)
    const totalVal = visiblePositions.reduce((s, p) => s + p.currentPrice * p.qty, 0)
    const dayPct   = totalVal > 0 ? (dayDollar / totalVal) * 100 : 0
    return { dollar: dayDollar, pct: dayPct }
  }, [visiblePositions])

  /* ── Best day mover ── */
  const bestToday = useMemo(() => {
    const withData = visiblePositions.filter(p => p.dayChangePct != null)
    if (!withData.length) return null
    return withData.reduce((best, p) =>
      p.dayChangePct > (best?.dayChangePct ?? -Infinity) ? p : best, null)
  }, [visiblePositions])

  const handleSelectTicker = (t) => {
    setTicker(t)
    setDetailOpen(true)
  }

  return (
    <div style={{
      padding: PAD, display: 'flex', flexDirection: 'column', gap: PAD,
      paddingBottom: isMobile ? 72 : PAD,
    }}>

      {/* ── Metric cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))',
        gap: PAD,
      }}>
        <StatCard icon={Wallet} label="Portfolio value"
          value={fUSD(totalValue)}
          sub={`${totalGain >= 0 ? '+' : ''}${fUSD(totalGain)} all-time`}
          subColor={totalGain >= 0 ? 'var(--green)' : 'var(--red)'}
          privacy />

        <StatCard icon={TrendingUp} label="Day P&L"
          value={dayPnL ? fSignedUSD(dayPnL.dollar) : '—'}
          sub={dayPnL
            ? `${fPct(dayPnL.pct)}${bestToday ? ` · best: ${bestToday.ticker}` : ''}`
            : 'No live data'}
          subColor={dayPnL
            ? dayPnL.dollar >= 0 ? 'var(--green)' : 'var(--red)'
            : 'var(--txt-muted)'}
          privacy />

        <StatCard icon={TrendingUp} label="Total return"
          value={fPct(gainPct)}
          sub={`${visiblePositions.length} positions`} />

        <StatCard icon={Zap} label="Avg conviction"
          value={liveConviction ? `${liveConviction.score}/100` : `${portfolioStats.avgConviction}/100`}
          sub={liveConviction ? liveConviction.label : 'Computing…'}
          subColor={liveConviction ? liveConviction.color : 'var(--txt-muted)'} />
      </div>

      {/* ── Upcoming earnings ── */}
      <EarningsStrip onSelectTicker={handleSelectTicker} />

      {/* ── Chart — full width ── */}
      <PriceChart
        ticker={ticker} onTickerChange={setTicker}
        range={range}   onRangeChange={setRange}
        prices={prices}
      />

      {/* ── Positions + Watchlist ── */}
      <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap: PAD }}>
        <PositionsTable
          positions={visiblePositions}
          sortBy={sortBy} sortDir={sortDir} onSort={handleSort}
          selectedTicker={ticker}
          onSelectTicker={handleSelectTicker}
          convictionResults={convictionResults}
          convictionLoading={convictionLoading}
        />
        <WatchlistPanel
          key={watchlistSeed}
          style={{ width: isMobile ? '100%' : 260, flexShrink: 0 }}
          convictionResults={watchlistResults}
          onSelectTicker={handleSelectTicker}
          onManage={() => setWatchlistEditorOpen(true)}
        />
      </div>

      {/* ── Ticker detail panel ── */}
      {detailOpen && (
        <TickerDetailPanel
          ticker={ticker}
          prices={prices}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {/* ── Watchlist editor modal ── */}
      {watchlistEditorOpen && (
        <WatchlistEditor
          onClose={() => setWatchlistEditorOpen(false)}
          onSaved={() => setWatchlistSeed(s => s + 1)}
        />
      )}
    </div>
  )
}
