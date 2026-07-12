/**
 * MODULE: LAYOUT / SettingsPanel.jsx
 * Advanced Settings: profile, worker connection, appearance,
 * import/export data, and danger zone.
 */

import { useState, useEffect, useRef } from 'react'
import { X, Globe, Link, CheckCircle, XCircle, Download, Upload,
         User, Trash2, Lock, Info, Moon, Sun } from 'lucide-react'
import { useLang }          from '../../context/LanguageContext.jsx'
import { useAuth }          from '../../context/AuthContext.jsx'
import { getWorkerUrl, setWorkerUrl, workerAPI } from '../../utils/api/worker.js'
import { loadWatchlist, saveWatchlist } from '../../utils/watchlistStorage.js'
import { loadOverrides, saveOverrides } from '../../utils/positionsStorage.js'

/* ── Section label ──────────────────────────────────────── */
function SectionLabel({ icon: Icon, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8,
      fontSize:11, fontWeight:700, color:'var(--txt-muted)',
      textTransform:'uppercase', letterSpacing:'0.08em',
      marginBottom:14, marginTop:4 }}>
      {Icon && <Icon size={12} />}
      {label}
      <div style={{ flex:1, height:1, background:'var(--border)' }} />
    </div>
  )
}

/* ── Main settings panel ────────────────────────────────── */
export default function SettingsPanel({ open, onClose, theme, toggleTheme }) {
  const { lang, switchLang, t } = useLang()
  const { profileName, deleteProfile, lock } = useAuth()
  const overlayRef = useRef(null)

  // Worker URL state
  const [workerUrl,    setWorkerUrlState] = useState(() => getWorkerUrl() || '')
  const [workerSaved,  setWorkerSaved]   = useState(false)
  const [workerStatus, setWorkerStatus]  = useState(null) // null | true | false
  const [workerTesting,setWorkerTesting] = useState(false)
  const [showUrl,      setShowUrl]       = useState(false)

  // Data management
  const [importError,  setImportError]  = useState('')
  const [importOk,     setImportOk]     = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)

  // Auto-test worker on open
  useEffect(() => {
    if (!open) return
    setWorkerStatus(null)
    setWorkerTesting(true)
    const timer = setTimeout(() => {
      workerAPI.status()
        .then(r => setWorkerStatus(r?.ok === true))
        .catch(() => setWorkerStatus(false))
        .finally(() => setWorkerTesting(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [open])

  // Escape to close
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const handleOverlayClick = e => { if (e.target === overlayRef.current) onClose() }

  const handleSaveUrl = () => {
    setWorkerUrl(workerUrl)
    setWorkerSaved(true)
    setTimeout(() => setWorkerSaved(false), 2000)
  }

  const handleTestUrl = async () => {
    setWorkerTesting(true); setWorkerStatus(null)
    try {
      const r = await workerAPI.status()
      setWorkerStatus(r?.ok === true)
    } catch { setWorkerStatus(false) }
    setWorkerTesting(false)
  }

  // ── Import portfolio from CSV ───────────────────────────
  const handleImportPortfolio = e => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(''); setImportOk('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const lines = ev.target.result.split('\n').filter(Boolean)
        const header = lines[0].toLowerCase()
        if (!header.includes('ticker')) { setImportError('CSV must have a "ticker" column'); return }
        const cols = header.split(',')
        const tickerIdx = cols.indexOf('ticker')
        const qtyIdx    = cols.indexOf('qty')
        const priceIdx  = cols.indexOf('avgprice')
        const acctIdx   = cols.indexOf('account')
        const imported = lines.slice(1).map(l => {
          const p = l.split(',')
          return {
            ticker:   p[tickerIdx]?.trim().toUpperCase(),
            qty:      qtyIdx >= 0    ? parseFloat(p[qtyIdx]) || 0 : 0,
            avgPrice: priceIdx >= 0  ? parseFloat(p[priceIdx]) || 0 : 0,
            account:  acctIdx >= 0   ? p[acctIdx]?.trim() : 'combined',
          }
        }).filter(i => i.ticker && i.ticker.length <= 6)
        if (!imported.length) { setImportError('No valid tickers found'); return }
        const existing = loadOverrides() ?? []
        const existingTickers = new Set(existing.map(p => p.ticker))
        const merged = [...existing, ...imported.filter(i => !existingTickers.has(i.ticker))]
        saveOverrides(merged)
        setImportOk(`Added ${merged.length - existing.length} positions`)
        setTimeout(() => setImportOk(''), 3000)
      } catch { setImportError('Failed to parse CSV') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Export watchlist as CSV ──────────────────────────────
  const handleExportWatchlist = () => {
    const items = loadWatchlist() ?? []
    if (!items.length) return
    const header = 'ticker,name,notes'
    const rows = items.map(i => `${i.ticker},${(i.name||'')},${ (i.notes||'')}`)
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `tp-watchlist-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Import watchlist from CSV ───────────────────────────
  const handleImportWatchlist = e => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(''); setImportOk('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const lines = ev.target.result.split('\n').filter(Boolean)
        const header = lines[0].toLowerCase()
        if (!header.includes('ticker')) {
          setImportError('CSV must have a "ticker" column'); return
        }
        const cols = header.split(',')
        const tickerIdx = cols.indexOf('ticker')
        const nameIdx   = cols.indexOf('name')
        const notesIdx  = cols.indexOf('notes')
        const imported = lines.slice(1).map(l => {
          const parts = l.split(',')
          return {
            ticker: parts[tickerIdx]?.trim().toUpperCase(),
            name:   nameIdx >= 0 ? parts[nameIdx]?.trim() : '',
            notes:  notesIdx >= 0 ? parts[notesIdx]?.trim() : '',
          }
        }).filter(i => i.ticker && i.ticker.length <= 6)

        if (!imported.length) { setImportError('No valid tickers found'); return }

        // Merge with existing (no duplicates)
        const existing = loadWatchlist() ?? []
        const existingTickers = new Set(existing.map(i => i.ticker))
        const newItems = [...existing, ...imported.filter(i => !existingTickers.has(i.ticker))]
        saveWatchlist(newItems)
        setImportOk(`Added ${imported.length - (imported.length - newItems.length + existing.length)} new tickers`)
        setTimeout(() => setImportOk(''), 3000)
      } catch { setImportError('Failed to parse CSV') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Export portfolio as CSV ─────────────────────────────
  const handleExportPortfolio = () => {
    const positions = loadOverrides() ?? []
    if (!positions.length) return
    const header = 'ticker,qty,avgPrice,account'
    const rows = positions.map(p => `${p.ticker},${p.qty||0},${p.avgPrice||0},${p.account||''}`)
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `tp-portfolio-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Clear user data ──────────────────────────────────────
  const handleClearData = () => {
    if (!clearConfirm) { setClearConfirm(true); setTimeout(() => setClearConfirm(false), 3000); return }
    deleteProfile()
    setClearConfirm(false)
    onClose()
  }

  const btn = (label, onClick, opts = {}) => (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 'var(--radius)',
      border: `1px solid ${opts.danger ? 'var(--red)' : 'var(--border)'}`,
      background: opts.danger ? 'var(--red-dim)' : 'transparent',
      color: opts.danger ? 'var(--red)' : opts.accent ? 'var(--accent)' : 'var(--txt-muted)',
      cursor: 'pointer', fontSize: 12, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
      ...opts.style,
    }}>{label}</button>
  )

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '20px 16px', backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 460,
        maxHeight: 'calc(100vh - 40px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:700, color:'var(--txt)' }}>Settings</span>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:7, border:'none',
            background:'var(--surface-up)', cursor:'pointer', color:'var(--txt-muted)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px 20px', overflowY: 'auto', flex:1, display:'flex', flexDirection:'column', gap:20 }}>

          {/* ── PROFILE ── */}
          <div>
            <SectionLabel icon={User} label={t.sectionProfile} />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 14px', background:'var(--surface-up)', borderRadius:'var(--radius-lg)' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>
                  {profileName || 'User'}
                </div>
                <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:2 }}>
                  Secured with passkey on this device
                </div>
              </div>
              <button onClick={() => { onClose(); setTimeout(() => lock(), 100) }}
                style={{ padding:'6px 12px', borderRadius:'var(--radius)',
                  border:'1px solid var(--border)', background:'transparent',
                  cursor:'pointer', fontSize:11, color:'var(--txt-muted)',
                  display:'flex', alignItems:'center', gap:5 }}>
                <Lock size={11} /> Lock now
              </button>
            </div>
          </div>

          {/* ── CONNECTION ── */}
          <div>
            <SectionLabel icon={Link} label={t.sectionConnection} />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:12 }}>
                {workerTesting && <span style={{ color:'var(--amber)' }}>↻ Connecting…</span>}
                {!workerTesting && workerStatus === true  && <><CheckCircle size={13} color="var(--green)" /><span style={{ color:'var(--green)' }}>{t.workerConnected}</span></>}
                {!workerTesting && workerStatus === false && <><XCircle size={13} color="var(--red)" /><span style={{ color:'var(--red)' }}>{t.workerFailed}</span></>}
                {!workerTesting && workerStatus === null  && <span style={{ color:'var(--txt-muted)' }}>{t.workerChecking}</span>}
              </div>
              <button onClick={() => setShowUrl(s => !s)} style={{ fontSize:10, color:'var(--txt-muted)',
                background:'transparent', border:'none', cursor:'pointer' }}>
                {showUrl ? '▲ Hide' : '▼ Change URL'}
              </button>
            </div>
            {showUrl && (
              <div style={{ display:'flex', gap:6 }}>
                <input value={workerUrl} onChange={e => setWorkerUrlState(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveUrl()}
                  placeholder="https://tradepoint-worker.*.workers.dev"
                  style={{ flex:1, padding:'7px 10px', background:'var(--surface-up)',
                    border:'1px solid var(--border)', borderRadius:'var(--radius)',
                    fontFamily:'var(--mono)', fontSize:11, color:'var(--txt)' }} />
                <button onClick={handleSaveUrl} style={{ padding:'0 12px', borderRadius:'var(--radius)',
                  border:'none', cursor:'pointer', fontSize:11, fontWeight:600,
                  background: workerSaved ? 'var(--green-dim)' : 'var(--accent-dim)',
                  color: workerSaved ? 'var(--green)' : 'var(--accent)' }}>
                  {workerSaved ? '✓' : 'Save'}
                </button>
                <button onClick={handleTestUrl} style={{ padding:'0 12px', borderRadius:'var(--radius)',
                  border:'1px solid var(--border)', background:'transparent',
                  color:'var(--txt-muted)', fontSize:11, cursor:'pointer' }}>Test</button>
              </div>
            )}
          </div>

          {/* ── APPEARANCE ── */}
          <div>
            <SectionLabel icon={Moon} label={t.sectionAppearance} />
            <div style={{ display:'flex', gap:8 }}>
              {[['dark', <><Moon size={12} /> Dark</>, 'dark'],['light', <><Sun size={12} /> Light</>, 'light']].map(([val, label]) => (
                <button key={val} onClick={() => theme !== val && toggleTheme()}
                  style={{ padding:'8px 20px', borderRadius:'var(--radius)',
                    border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                    background: theme === val ? 'var(--accent)' : 'var(--surface-up)',
                    color: theme === val ? '#fff' : 'var(--txt-sec)',
                    display:'flex', alignItems:'center', gap:5 }}>{label}</button>
              ))}
            </div>
          </div>

          {/* ── LANGUAGE ── */}
          <div>
            <SectionLabel icon={Globe} label={t.sectionLanguage} />
            <div style={{ display:'flex', gap:8 }}>
              {['en', 'es'].map(code => (
                <button key={code} onClick={() => switchLang(code)}
                  style={{ padding:'8px 20px', borderRadius:'var(--radius)',
                    border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
                    background: lang === code ? 'var(--accent)' : 'var(--surface-up)',
                    color: lang === code ? '#fff' : 'var(--txt-sec)' }}>
                  {code === 'en' ? t.langEnglish : t.langSpanish}
                </button>
              ))}
            </div>
          </div>

          {/* ── DATA ── */}
          <div>
            <SectionLabel icon={Download} label={t.sectionData} />
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              <label style={{ padding:'8px 14px', borderRadius:'var(--radius)',
                border:'1px solid var(--border)', cursor:'pointer', fontSize:12, fontWeight:600,
                color:'var(--accent)', display:'flex', alignItems:'center', gap:6 }}>
                <Upload size={12} /> Import Portfolio CSV
                <input type="file" accept=".csv" onChange={handleImportPortfolio}
                  style={{ display:'none' }} />
              </label>
              {btn(<><Download size={12} /> Export Portfolio CSV</>, handleExportPortfolio, { accent: true })}
              <label style={{ padding:'8px 14px', borderRadius:'var(--radius)',
                border:'1px solid var(--border)', cursor:'pointer', fontSize:12, fontWeight:600,
                color:'var(--accent)', display:'flex', alignItems:'center', gap:6 }}>
                <Upload size={12} /> Import Watchlist CSV
                <input type="file" accept=".csv" onChange={handleImportWatchlist}
                  style={{ display:'none' }} />
              </label>
              {btn(<><Download size={12} /> Export Watchlist CSV</>, handleExportWatchlist, { accent: true })}
            </div>
            {importError && <div style={{ fontSize:10, color:'var(--red)', marginTop:6 }}>{importError}</div>}
            {importOk    && <div style={{ fontSize:10, color:'var(--green)', marginTop:6 }}>{importOk}</div>}
          </div>

          {/* ── ABOUT ── */}
          <div>
            <SectionLabel icon={Info} label={t.sectionAbout} />
            <div style={{ fontSize:11, color:'var(--txt-muted)', lineHeight:1.8,
              padding:'10px 12px', background:'var(--surface-up)', borderRadius:'var(--radius-lg)' }}>
              <div><b style={{ color:'var(--txt)' }}>TradePoint Lab</b> · Build 2026-07-11-C · Engine v1.0</div>
              <div>Data: Finnhub · Alpaca · Groq Llama 3.3 70B</div>
              <div>Infrastructure: Cloudflare Pages · Workers · KV · D1</div>
            </div>
          </div>

          {/* ── DANGER ZONE ── */}
          {/* Clear chart cache */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--txt)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Chart Cache
            </div>
            <div style={{ fontSize:10, color:'var(--txt-muted)', marginBottom:8 }}>
              Clears locally cached OHLCV chart data. Use when charts show
              outdated history (2Y/5Y) after the server was updated.
            </div>
            <button onClick={() => {
              const keys = Object.keys(localStorage).filter(k => k.includes('tp_ohlcv') || k.includes('tp_fund'))
              keys.forEach(k => localStorage.removeItem(k))
              alert(`Cleared ${keys.length} chart cache entries. Reload the page to see fresh data.`)
            }} style={{
              padding:'7px 14px', borderRadius:'var(--radius)',
              background:'var(--surface-up)', border:'1px solid var(--border)',
              color:'var(--txt-muted)', cursor:'pointer', fontSize:11, fontWeight:600
            }}>
              Clear Chart Cache
            </button>
          </div>

          <div>
            <SectionLabel icon={Trash2} label={t.sectionDanger} />
            <div style={{ padding:'12px', border:'1px solid var(--red-dim)',
              borderRadius:'var(--radius-lg)', background:'rgba(239,68,68,0.03)' }}>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginBottom:10 }}>
                Permanently deletes your profile, portfolio, watchlist and earnings from this device.
                Market data cache is preserved.
              </div>
              <button onClick={handleClearData} style={{
                padding:'8px 14px', borderRadius:'var(--radius)',
                border:'1px solid var(--red)', background: clearConfirm ? 'var(--red-dim)' : 'transparent',
                color:'var(--red)', cursor:'pointer', fontSize:12, fontWeight:600,
                display:'flex', alignItems:'center', gap:6 }}>
                <Trash2 size={12} />
                {clearConfirm ? t.btnDeleteConfirm : t.btnDeleteProfile}
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)',
          display:'flex', justifyContent:'flex-end', gap:8, flexShrink:0 }}>
          <button onClick={onClose} style={{ padding:'9px 20px',
            borderRadius:'var(--radius)', border:'1px solid var(--border)',
            background:'transparent', cursor:'pointer', fontSize:13,
            fontWeight:600, color:'var(--txt-muted)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
