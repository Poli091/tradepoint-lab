/**
 * MODULE: HOOKS / useTradepoint.js
 * Central UI state for the app.
 * NOTE: visiblePositions and portfolioStats are computed in App.jsx
 * using live prices from useMarketData — not here.
 */

import { useState, useEffect } from 'react'
import { getUserId } from '../auth/webauthn.js'

export function useTradepoint() {
  // ── Navigation ──────────────────────────────────────────
  const [view,    setView]    = useState('dashboard')

  // ── Account selection ────────────────────────────────────
  const [account, setAccount] = useState('combined')

  // ── Chart ────────────────────────────────────────────────
  const [ticker,  setTicker]  = useState('')
  const [range,   setRange]   = useState('3M')

  // ── Positions table sort ─────────────────────────────────
  const [sortBy,  setSortBy]  = useState('upside')
  const [sortDir, setSortDir] = useState('desc')

  // ── Order panel ──────────────────────────────────────────
  const [side,       setSide]       = useState('buy')
  const [orderType,  setOrderType]  = useState('market')
  const [qty,        setQty]        = useState(1)
  const [limitPrice, setLimitPrice] = useState('')

  // ── Theme ─────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    const uid = getUserId()
    const key = uid ? `tp_${uid}_theme` : 'tp-theme'
    return localStorage.getItem(key) || 'dark'
  })
  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark'
      const uid = getUserId()
      const key = uid ? `tp_${uid}_theme` : 'tp-theme'
      localStorage.setItem(key, next)
      return next
    })
  }

  // ── Sort handler ─────────────────────────────────────────
  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  // ── Qty helpers ───────────────────────────────────────────
  const incQty = () => setQty(q => q + 1)
  const decQty = () => setQty(q => Math.max(1, q - 1))

  return {
    // Theme
    theme, toggleTheme,
    // Privacy
    privacyMode, togglePrivacy,
    // Navigation
    view, setView,
    // Account
    account, setAccount,
    // Chart
    ticker, setTicker,
    range, setRange,
    // Sort
    sortBy, sortDir, handleSort,
    // Order
    side, setSide,
    orderType, setOrderType,
    qty, setQty, incQty, decQty,
    limitPrice, setLimitPrice,
  }
}
