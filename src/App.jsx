/**
 * MODULE: ROOT / App.jsx
 * App shell: Language provider → Sidebar + Header + active view + Settings panel.
 */

import { useState, useEffect } from 'react'
import { LanguageProvider }  from './context/LanguageContext.jsx'
import Sidebar               from './components/layout/Sidebar.jsx'
import Header                from './components/layout/Header.jsx'
import SettingsPanel         from './components/layout/SettingsPanel.jsx'
import DashboardView         from './views/DashboardView.jsx'
import PositionsView         from './views/PositionsView.jsx'
import WatchlistView         from './views/WatchlistView.jsx'
import CalendarView          from './views/CalendarView.jsx'
import { useTradepoint }     from './hooks/useTradepoint.js'

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
    visiblePositions,
    portfolioStats,
  } = useTradepoint()

  const [settingsOpen, setSettingsOpen] = useState(false)

  /* Apply theme to <html> */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
          <DashboardView
            visiblePositions={visiblePositions} portfolioStats={portfolioStats}
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
      case 'watchlist': return <WatchlistView />
      case 'calendar':  return <CalendarView />
      default:          return null
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
          visiblePositions={visiblePositions}
          portfolioStats={portfolioStats}
        />
        <main className="app-content">
          {renderView()}
        </main>
      </div>

      {/* Settings modal — rendered at root level to overlay everything */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  )
}
