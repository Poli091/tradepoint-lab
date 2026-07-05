/**
 * MODULE: VIEWS / DashboardView.jsx
 * Main dashboard layout: stat cards · chart · order panel · positions · watchlist
 */

import { Wallet, TrendingUp, Trophy, Target } from 'lucide-react'
import StatCard from '../components/ui/StatCard.jsx'
import PriceChart from '../components/widgets/PriceChart.jsx'
import OrderPanel from '../components/widgets/OrderPanel.jsx'
import PositionsTable from '../components/widgets/PositionsTable.jsx'
import WatchlistPanel from '../components/widgets/WatchlistPanel.jsx'
import { calcPnL } from '../utils/finance.js'
import { fUSD, fPct, fSignedUSD } from '../utils/format.js'

const PAD = 16

export default function DashboardView({
  visiblePositions, portfolioStats,
  ticker, setTicker, range, setRange,
  sortBy, sortDir, handleSort,
  side, setSide, orderType, setOrderType,
  qty, incQty, decQty, limitPrice, setLimitPrice,
}) {
  const { totalValue, totalGain, gainPct, avgConviction, best } = portfolioStats

  return (
    <div style={{ padding: PAD, display: 'flex', flexDirection: 'column', gap: PAD }}>

      {/* ── Metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: PAD }}>
        <StatCard
          icon={Wallet}
          label="Portfolio value"
          value={fUSD(totalValue)}
          sub={`${totalGain >= 0 ? '+' : ''}${fUSD(totalGain)} all-time`}
          subColor={totalGain >= 0 ? 'var(--green)' : 'var(--red)'}
        />
        <StatCard
          icon={TrendingUp}
          label="Total return"
          value={fPct(gainPct)}
          sub={`${visiblePositions.length} positions`}
        />
        <StatCard
          icon={Trophy}
          label="Best performer"
          value={best ? best.ticker : '—'}
          sub={best ? `+${calcPnL(best).gainPct.toFixed(1)}% gain` : ''}
          subColor="var(--green)"
        />
        <StatCard
          icon={Target}
          label="Avg conviction"
          value={`${avgConviction}/100`}
          sub={avgConviction >= 76 ? 'Strong' : avgConviction >= 60 ? 'Moderate' : 'Weak'}
          subColor={avgConviction >= 76 ? 'var(--green)' : avgConviction >= 60 ? 'var(--amber)' : 'var(--red)'}
        />
      </div>

      {/* ── Chart + Order panel ── */}
      <div style={{ display: 'flex', gap: PAD, alignItems: 'flex-start' }}>
        <PriceChart
          ticker={ticker}
          onTickerChange={setTicker}
          range={range}
          onRangeChange={setRange}
        />
        <OrderPanel
          ticker={ticker}
          side={side} setSide={setSide}
          orderType={orderType} setOrderType={setOrderType}
          qty={qty} incQty={incQty} decQty={decQty}
          limitPrice={limitPrice} setLimitPrice={setLimitPrice}
        />
      </div>

      {/* ── Positions + Watchlist ── */}
      <div style={{ display: 'flex', gap: PAD, alignItems: 'flex-start' }}>
        <PositionsTable
          positions={visiblePositions}
          sortBy={sortBy} sortDir={sortDir} onSort={handleSort}
          selectedTicker={ticker} onSelectTicker={setTicker}
        />
        <WatchlistPanel />
      </div>

    </div>
  )
}
