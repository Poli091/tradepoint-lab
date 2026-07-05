/**
 * MODULE: ROOT / App.jsx
 * Shell: Sidebar + Header + active view.
 * To add a new view: register it in VIEWS and add a nav item in Sidebar.jsx.
 */

import { useEffect } from 'react'
import Sidebar        from './components/layout/Sidebar.jsx'
import Header         from './components/layout/Header.jsx'
import DashboardView  from './views/DashboardView.jsx'
import PositionsView  from './views/PositionsView.jsx'
import WatchlistView  from './views/WatchlistView.jsx'
import CalendarView   from './views/CalendarView.jsx'
import { useTradepoint } from './hooks/useTradepoint.js'

export default function App() {
  const state = useTradepoint()

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
    visiblePositions,
    portfolioStats,
  } = state

  // ── Apply theme to <html> so CSS vars cascade everywhere ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // ── View registry ── add new pages here ──
  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
          <DashboardView
            visiblePositions={visiblePositions}
            portfolioStats={portfolioStats}
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
            visiblePositions={visiblePositions}
            sortBy={sortBy} sortDir={sortDir} handleSort={handleSort}
            ticker={ticker} setTicker={setTicker}
          />
        )
      case 'watchlist':
        return <WatchlistView />

      case 'calendar':
        return <CalendarView />

      default:
        return null
    }
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} theme={theme} toggleTheme={toggleTheme} />
      <div className="app-main">
        <Header
          account={account}
          setAccount={setAccount}
          visiblePositions={visiblePositions}
          portfolioStats={portfolioStats}
        />
        <main className="app-content">
          {renderView()}
        </main>
      </div>
    </div>
  )
}
