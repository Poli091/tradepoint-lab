/**
 * MODULE: VIEWS / DashboardView.jsx
 * Main dashboard.
 * - Order Entry removed (not used for actual trading)
 * - AVG CONVICTION shows real computed average from engine
 * - Chart takes full width
 */

import { useState, useMemo } from 'react'
import { Wallet, TrendingUp, Trophy, Zap } from 'lucide-react'
import StatCard            from '../components/ui/StatCard.jsx'
import PriceChart          from '../components/widgets/PriceChart.jsx'
import PositionsTable      from '../components/widgets/PositionsTable.jsx'
import WatchlistPanel      from '../components/widgets/WatchlistPanel.jsx'
import TickerDetailPanel   from '../components/widgets/TickerDetailPanel.jsx'
import { useBreakpoint }   from '../hooks/useBreakpoint.js'
import { getGrade }        from '../conviction/grade/index.js'
import { calcPnL }         from '../utils/finance.js'
import { fUSD, fPct }      from '../utils/format.js'

const PAD = 14

export default function DashboardView({
  visiblePositions, portfolioStats, prices = {},
  ticker, setTicker, range, setRange,
  sortBy, sortDir, handleSort,
  convictionResults = {}, convictionLoading = false,
  watchlistResults = {},
}) {
  const { isMobile } = useBreakpoint()
  const { totalValue, totalGain, gainPct, best } = portfolioStats
  const [detailOpen, setDetailOpen] = useState(false)

  /* ── Real avg conviction from engine results ── */
  const liveConviction = useMemo(() => {
    const scores = Object.values(convictionResults)
      .map(r => r.finalScore)
      .filter(s => s != null)
    if (scores.length === 0) return null
    const avg   = Math.round(scores.reduce((a,b) => a+b,0) / scores.length * 10) / 10
    const grade = getGrade(avg)
    return { score: avg, label: grade.label, color: grade.color }
  }, [convictionResults])

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
        <StatCard icon={Wallet}    label="Portfolio value"
          value={fUSD(totalValue)}
          sub={`${totalGain >= 0 ? '+' : ''}${fUSD(totalGain)} all-time`}
          subColor={totalGain >= 0 ? 'var(--green)' : 'var(--red)'} />

        <StatCard icon={TrendingUp} label="Total return"
          value={fPct(gainPct)}
          sub={`${visiblePositions.length} positions`} />

        <StatCard icon={Trophy}     label="Best performer"
          value={best ? best.ticker : '—'}
          sub={best ? `+${calcPnL(best).gainPct.toFixed(1)}% gain` : ''}
          subColor="var(--green)" />

        <StatCard icon={Zap}        label="Avg conviction"
          value={liveConviction ? `${liveConviction.score}/100` : `${portfolioStats.avgConviction}/100`}
          sub={liveConviction ? liveConviction.label : 'Computing…'}
          subColor={liveConviction ? liveConviction.color : 'var(--txt-muted)'} />
      </div>

      {/* ── Chart — full width now that Order Entry is removed ── */}
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
        <WatchlistPanel style={{ width: isMobile ? '100%' : 260, flexShrink: 0 }} convictionResults={watchlistResults} />
      </div>

      {/* ── Ticker detail panel ── */}
      {detailOpen && (
        <TickerDetailPanel
          ticker={ticker}
          prices={prices}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  )
}
