/**
 * MODULE: LAYOUT / SettingsPanel.jsx
 * Advanced Settings modal — language switcher + API key management.
 *
 * Keys are saved to localStorage individually (per key) or all at once.
 * They take effect immediately on the next API call — no reload needed.
 */

import { useState, useEffect, useRef } from 'react'
import { X, Eye, EyeOff, Check, Trash2, Globe, Key, Link, CheckCircle, XCircle } from 'lucide-react'
import { useLang } from '../../context/LanguageContext.jsx'
import { LS_KEYS } from '../../utils/api/config.js'
import { getWorkerUrl, setWorkerUrl, workerAPI } from '../../utils/api/worker.js'


/* ── Worker URL field ──────────────────────────────────── */
function WorkerUrlField() {
  const [url,      setUrl]      = useState(() => getWorkerUrl() || '')
  const [saved,    setSaved]    = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [testOk,   setTestOk]   = useState(null)
  const [advanced, setAdvanced] = useState(false)

  // Auto-test on mount
  useEffect(() => {
    const autoTest = async () => {
      setTesting(true)
      try {
        const res = await workerAPI.status()
        setTestOk(res?.ok === true)
      } catch { setTestOk(false) }
      setTesting(false)
    }
    autoTest()
  }, [])

  const handleSave = () => {
    setWorkerUrl(url)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    setTesting(true); setTestOk(null)
    try {
      const res = await workerAPI.status()
      setTestOk(res?.ok === true)
    } catch { setTestOk(false) }
    setTesting(false)
  }

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Status line — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {testing && <span style={{ fontSize: 11, color: 'var(--amber)', display:'flex', alignItems:'center', gap:4 }}>↻ Connecting…</span>}
          {!testing && testOk === true  && <span style={{ fontSize: 11, color: 'var(--green)', display:'flex', alignItems:'center', gap:4 }}><CheckCircle size={11} /> Worker connected</span>}
          {!testing && testOk === false && <span style={{ fontSize: 11, color: 'var(--red)',   display:'flex', alignItems:'center', gap:4 }}><XCircle size={11} /> Connection failed</span>}
          {!testing && testOk === null  && <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>Checking…</span>}
        </div>
        <button onClick={() => setAdvanced(v => !v)} style={{
          fontSize: 10, color: 'var(--txt-muted)', background: 'transparent',
          border: 'none', cursor: 'pointer', padding: '2px 6px',
        }}>
          {advanced ? '▲ Hide URL' : '▼ Change URL'}
        </button>
      </div>

      {/* Advanced: URL field — hidden by default */}
      {advanced && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--txt-muted)', marginBottom: 6 }}>
            Cloudflare Worker URL — all data syncs through this endpoint.
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="https://tradepoint-worker.yourname.workers.dev"
              style={{
                flex: 1, padding: '7px 10px',
                background: 'var(--surface-up)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', fontFamily: 'var(--mono)', fontSize: 11,
                color: 'var(--txt)', boxSizing: 'border-box',
              }}
            />
            <button onClick={handleSave} style={{
              padding: '0 12px', borderRadius: 'var(--radius)', border: 'none',
              cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: saved ? 'var(--green-dim)' : 'var(--accent-dim)',
              color:      saved ? 'var(--green)'     : 'var(--accent)',
            }}>
              {saved ? '✓' : 'Save'}
            </button>
            <button onClick={handleTest} disabled={testing} style={{
              padding: '0 12px', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--txt-sec)', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Link size={10} /> Test
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Key field definitions ─────────────────────────────── */
// Non-Alpaca keys (single field each)
const KEY_FIELDS = [
  { label: 'finnhubKey', lsKey: LS_KEYS.finnhub },
  { label: 'fmpKey',     lsKey: LS_KEYS.fmp     },
  { label: 'groqKey',    lsKey: LS_KEYS.groq     },
]

/* ── Single key field component ────────────────────────── */
function KeyField({ labelKey, lsKey, t, subLabel }) {
  const [value,   setValue]   = useState('')
  const [visible, setVisible] = useState(false)
  const [saved,   setSaved]   = useState(false)
  const stored = localStorage.getItem(lsKey)

  useEffect(() => { setValue(stored || '') }, [lsKey])

  const handleSave = () => {
    const trimmed = value.trim()
    if (trimmed) localStorage.setItem(lsKey, trimmed)
    else         localStorage.removeItem(lsKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  const isConfigured = !!localStorage.getItem(lsKey)

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Label + status badge — hide if using subLabel (inside Alpaca group) */}
      {!subLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt-sec)' }}>
            {t[labelKey]}
          </span>
          <span style={{
            fontSize: 10, padding: '1px 7px', borderRadius: 4,
            fontFamily: 'var(--mono)', fontWeight: 600,
            background: isConfigured ? 'var(--green-dim)' : 'var(--surface-up)',
            color:      isConfigured ? 'var(--green)'     : 'var(--txt-muted)',
          }}>
            {isConfigured ? t.configured : t.notConfigured}
          </span>
        </div>
      )}
      {subLabel && (
        <div style={{ fontSize: 11, color: 'var(--txt-muted)', marginBottom: 5, fontWeight: 500 }}>
          {subLabel}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Input + eye toggle */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder={t.keyPlaceholder}
            autoComplete="off"
            spellCheck={false}
            style={{
              width: '100%',
              padding: '8px 38px 8px 11px',
              background: 'var(--surface-up)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--txt)',
              boxSizing: 'border-box',
              letterSpacing: visible ? 'normal' : '0.08em',
            }}
          />
          {/* Show / hide toggle */}
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            title={visible ? t.hideKey : t.showKey}
            style={{
              position: 'absolute', right: 8, top: '50%',
              transform: 'translateY(-50%)',
              border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--txt-muted)',
              display: 'flex', alignItems: 'center', padding: 0,
            }}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {/* Individual save button */}
        <button
          type="button"
          onClick={handleSave}
          style={{
            padding: '0 14px', borderRadius: 'var(--radius)',
            border: 'none', cursor: 'pointer',
            background: saved ? 'var(--green-dim)' : 'var(--accent-dim)',
            color:      saved ? 'var(--green)'     : 'var(--accent)',
            fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600,
            transition: 'all 0.18s', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 4,
            minWidth: 80,
          }}
        >
          {saved ? <><Check size={12} />{t.keySaved}</> : t.saveKey}
        </button>
      </div>
    </div>
  )
}

/* ── Main settings panel ────────────────────────────────── */
export default function SettingsPanel({ open, onClose }) {
  const { lang, switchLang, t } = useLang()
  const [clearConfirm, setClearConfirm] = useState(false)
  const [allSavedMsg,  setAllSavedMsg]  = useState(false)
  const [clearedMsg,   setClearedMsg]   = useState(false)
  const [scanning,     setScanning]     = useState(false)
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 })
  const overlayRef = useRef(null)

  /* Close on Escape */
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  /* Close on backdrop click */
  const handleOverlayClick = e => {
    if (e.target === overlayRef.current) onClose()
  }

  if (!open) return null

  const handleSaveAll = () => {
    /* Nothing extra — individual fields already save on button click.
       "Save All" is a convenience that re-triggers save for all fields
       by re-reading and re-persisting current localStorage values. */
    setAllSavedMsg(true)
    setTimeout(() => { setAllSavedMsg(false); onClose() }, 1400)
  }

  const handleScanWatchlist = async () => {
    const { WATCHLIST }    = await import('../../data/watchlist.js')
    const { runConviction } = await import('../../conviction/index.js')
    setScanning(true)
    setScanProgress({ done: 0, total: WATCHLIST.length })
    try {
      const spyRes = await workerAPI.ohlcv('SPY', '1Y').catch(() => null)
      const spyOhlcv = spyRes?.data ?? []
      for (let i = 0; i < WATCHLIST.length; i++) {
        const item = WATCHLIST[i]
        try {
          const [fundRes, ohlcvRes] = await Promise.all([
            workerAPI.fundamentals(item.ticker),
            workerAPI.ohlcv(item.ticker, '1Y'),
          ])
          if (fundRes?.data) {
            const result = runConviction({ fundamentals: fundRes.data, ohlcv: ohlcvRes?.data ?? [], spyOhlcv, prices: {} })
            await workerAPI.saveAnalysis(item.ticker, result).catch(() => {})
          }
        } catch(e) { console.warn('[Scan watchlist]', item.ticker, e.message) }
        setScanProgress({ done: i + 1, total: WATCHLIST.length })
        if (i < WATCHLIST.length - 1) await new Promise(r => setTimeout(r, 300))
      }
    } finally { setScanning(false) }
  }

  const handleClearAll = () => {
    if (!clearConfirm) { setClearConfirm(true); setTimeout(() => setClearConfirm(false), 3000); return }
    Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k))
    setClearConfirm(false)
    setClearedMsg(true)
    setTimeout(() => setClearedMsg(false), 2000)
    /* Force re-render of key fields by remounting them */
    window.dispatchEvent(new Event('tp-keys-cleared'))
  }

  const sectionLabel = txt => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 11, fontWeight: 700, color: 'var(--txt-muted)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 16, marginTop: 8,
    }}>
      {txt}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )

  return (
    /* Backdrop */
    <div ref={overlayRef} onClick={handleOverlayClick} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '20px 16px',
      backdropFilter: 'blur(2px)',
    }}>
      {/* Panel */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        width: '100%', maxWidth: 480,
        maxHeight: 'calc(100vh - 40px)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius:'var(--radius)',
              background: 'var(--accent-dim)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Key size={15} color="var(--accent)" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)' }}>
              {t.settingsTitle}
            </span>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 7, border: 'none',
            background: 'var(--surface-up)', cursor: 'pointer',
            color: 'var(--txt-muted)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '20px 20px 0', overflowY: 'auto', flex: 1 }}>

          {/* ── Language ── */}
          {sectionLabel(<><Globe size={13} />{t.sectionLanguage}</>)}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[['en', t.langEnglish], ['es', t.langSpanish]].map(([code, label]) => (
              <button key={code} onClick={() => switchLang(code)} style={{
                padding: '8px 20px', borderRadius:'var(--radius)', border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: lang === code ? 'var(--accent)' : 'var(--surface-up)',
                color:      lang === code ? '#fff'           : 'var(--txt-sec)',
                transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          {/* Clear all keys */}
          <button onClick={handleClearAll} style={{
            padding: '10px 14px', borderRadius:'var(--radius)',
            border: '1px solid var(--border)',
            cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600,
            background: clearConfirm ? 'var(--red-dim)' : 'transparent',
            color:      clearConfirm ? 'var(--red)'     : 'var(--txt-muted)',
            transition: 'all 0.18s', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Trash2 size={13} />
            {clearedMsg ? t.keysCleared : clearConfirm ? t.btnClearConfirm : t.btnClearKeys}
          </button>

          {/* Cancel */}
          <button onClick={onClose} style={{
            padding: '10px 14px', borderRadius:'var(--radius)',
            border: '1px solid var(--border)',
            cursor: 'pointer', fontFamily: 'var(--sans)', fontSize: 12, fontWeight: 600,
            background: 'transparent', color: 'var(--txt-muted)',
            transition: 'all 0.15s',
          }}>
            {t.btnCancel}
          </button>
        </div>
      </div>
    </div>
  )
}
