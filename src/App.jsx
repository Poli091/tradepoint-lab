/**
 * MODULE: ROOT / App.jsx
 * Integrates live market data with UI state.
 * liveVisiblePositions override the static positions with real prices.
 */

import { useState, useEffect, useMemo } from 'react'
import { LanguageProvider }       from './context/LanguageContext.jsx'
import { AuthProvider, useAuth }  from './context/AuthContext.jsx'
import LockScreen                 from './auth/LockScreen.jsx'
import Sidebar                    from './components/layout/Sidebar.jsx'
import Header                     from './components/layout/Header.jsx'
import SettingsPanel              from './components/layout/SettingsPanel.jsx'
import DashboardView              from './views/DashboardView.jsx'
import PositionsView              from './views/PositionsView.jsx'
import WatchlistView              from './views/WatchlistView.jsx'
import CalendarView               from './views/CalendarView.jsx'
import DiagnosticsView            from './views/DiagnosticsView.jsx'
import { useTradepoint }          from './hooks/useTradepoint.js'
import { useMarketData }          from './hooks/useMarketData.js'
import { filterByAccount, calcPortfolioStats } from './utils/finance.js'

/* ── Live data badge ───────────────────────────────────── */
function LiveBadge({ loading, lastUpdated, error }) {
  if (error)       return <span style={{ fontSize:10, color:'var(--red)',     fontFamily:'var(--mono)' }}>⚠ {error.slice(0,40)}</span>
  if (loading)     return <span style={{ fontSize:10, color:'var(--amber)',   fontFamily:'var(--mono)' }}>↻ Updating…</span>
  if (lastUpdated) {
    const secs  = Math.round((Date.now() - lastUpdated) / 1000)
    const label = secs < 60 ? `${secs}s ago` : `${Math.round(secs/60)}m ago`
    return <span style={{ fontSize:10, color:'var(--green)', fontFamily:'var(--mono)' }}>● Live · {label}</span>
  }
  return <span style={{ fontSize:10, color:'var(--txt-muted)', fontFamily:'var(--mono)' }}>○ Simulated</span>
}

/* ── Main app ──────────────────────────────────────────── */
function AppInner() {
  const {
    theme, toggleTheme,
    view, setView,
    account, setAccount,
    ticker, setTicker,
    range, setRange,
    sortBy, sortDir, handleSort,
    side, setSide,
    orderType, setOrderType,
    qty, incQty, decQty,
    limitPrice, setLimitPrice,
  } = useTradepoint()

  const { livePositions, prices, loading: pricesLoading, error: pricesError, lastUpdated } = useMarketData()

  const liveVisiblePositions = useMemo(() => {
    const base = filterByAccount(account)
    return livePositions.filter(p => base.some(b => b.ticker === p.ticker))
  }, [account, livePositions])

  const portfolioStats = useMemo(
    () => calcPortfolioStats(liveVisiblePositions),
    [liveVisiblePositions]
  )

  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
          <DashboardView
            visiblePositions={liveVisiblePositions}
            portfolioStats={portfolioStats}
            prices={prices}
            ticker={ticker} setTicker={setTicker}
            range={range}   setRange={setRange}
            sortBy={sortBy} sortDir={sortDir} handleSort={handleSort}
            side={side} setSide={setSide}
            orderType={orderType} setOrderType={setOrderType}
            qty={qty} incQty={incQty} decQty={decQty}
            limitPrice={limitPrice} setLimitPrice={setLimitPrice}
          />
        )
      case 'positions':
        return (
          <PositionsView
            visiblePositions={liveVisiblePositions}
            sortBy={sortBy} sortDir={sortDir} handleSort={handleSort}
            ticker={ticker} setTicker={setTicker}
          />
        )
      case 'watchlist':
        return <WatchlistView />
      case 'calendar':
        return <CalendarView />
      case 'diagnostics':
        return (
          <DiagnosticsView
            visiblePositions={liveVisiblePositions}
            prices={prices}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view} setView={setView}
        theme={theme} toggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="app-main">
        <Header
          account={account} setAccount={setAccount}
          visiblePositions={liveVisiblePositions}
          portfolioStats={portfolioStats}
          liveBadge={<LiveBadge loading={pricesLoading} lastUpdated={lastUpdated} error={pricesError} />}
        />
        <main className="app-content">{renderView()}</main>
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

/* ── Auth gate ─────────────────────────────────────────── */
function AuthGate() {
  const { authenticated } = useAuth()
  if (!authenticated) return <LockScreen />
  return <AppInner />
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </LanguageProvider>
  )
}
