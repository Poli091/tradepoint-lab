/**
 * MODULE: WIDGETS / PositionEditor.jsx
 * Add / edit / delete portfolio positions.
 * Stores overrides in localStorage (bridge before multi-user D1).
 */

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, ChevronDown } from 'lucide-react'
import { POSITIONS }        from '../../data/positions.js'
import { loadOverrides, saveOverrides, clearOverrides } from '../../utils/positionsStorage.js'
import { fUSD }             from '../../utils/format.js'

const ACCOUNTS = ['Roth IRA', 'Brokerage']

function toNumber(v) {
  const n = parseFloat(String(v).replace(/[$,]/g, ''))
  return isNaN(n) ? 0 : n
}

function PositionRow({ pos, onEdit, onDelete }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8,
      padding:'8px 12px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ flex:1 }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--txt)' }}>{pos.ticker}</span>
        <span style={{ fontSize:11, color:'var(--txt-muted)', marginLeft:8 }}>{pos.account}</span>
      </div>
      <div style={{ textAlign:'right', fontSize:12, color:'var(--txt-sec)', fontFamily:'var(--mono)', minWidth:80 }}>
        {pos.qty} × {fUSD(pos.avgPrice)}
      </div>
      <button onClick={() => onEdit(pos)} style={{ background:'transparent', border:'none',
        cursor:'pointer', color:'var(--txt-muted)', padding:4,
        display:'flex', alignItems:'center' }}>
        <Pencil size={12} />
      </button>
      <button onClick={() => onDelete(pos.ticker)} style={{ background:'transparent', border:'none',
        cursor:'pointer', color:'var(--red)', padding:4,
        display:'flex', alignItems:'center' }}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function PositionForm({ initial, onSave, onCancel }) {
  const [ticker,   setTicker]   = useState(initial?.ticker   ?? '')
  const [name,     setName]     = useState(initial?.name     ?? '')
  const [qty,      setQty]      = useState(initial?.qty      ?? '')
  const [avgPrice, setAvgPrice] = useState(initial?.avgPrice ?? '')
  const [account,  setAccount]  = useState(initial?.account  ?? 'Brokerage')
  const [upside,   setUpside]   = useState(initial?.upside   ?? '')
  const [error,    setError]    = useState('')

  const handleSave = () => {
    const t = ticker.trim().toUpperCase()
    if (!t)           return setError('Ticker is required')
    if (!toNumber(qty))      return setError('Quantity must be > 0')
    if (!toNumber(avgPrice)) return setError('Avg price must be > 0')
    setError('')
    onSave({
      ticker:       t,
      name:         name.trim() || t,
      qty:          toNumber(qty),
      avgPrice:     toNumber(avgPrice),
      currentPrice: toNumber(avgPrice), // will be overridden by live price
      account,
      upside:       toNumber(upside) || 0,
      conviction:   50, // placeholder until engine runs
    })
  }

  const inputStyle = {
    width:'100%', padding:'7px 10px', boxSizing:'border-box',
    background:'var(--surface-up)', border:'1px solid var(--border)',
    borderRadius:6, color:'var(--txt)', fontSize:12, fontFamily:'var(--mono)',
  }
  const labelStyle = { fontSize:10, color:'var(--txt-muted)', fontWeight:600,
    textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4, display:'block' }

  return (
    <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <label style={labelStyle}>Ticker *</label>
          <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())}
            placeholder="NVDA" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Company name</label>
          <input value={name} onChange={e=>setName(e.target.value)}
            placeholder="NVIDIA Corporation" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Quantity *</label>
          <input value={qty} onChange={e=>setQty(e.target.value)}
            placeholder="10.5" type="number" min="0" step="any" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Avg price *</label>
          <input value={avgPrice} onChange={e=>setAvgPrice(e.target.value)}
            placeholder="142.50" type="number" min="0" step="any" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Account</label>
          <select value={account} onChange={e=>setAccount(e.target.value)}
            style={{ ...inputStyle, cursor:'pointer' }}>
            {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Analyst upside %</label>
          <input value={upside} onChange={e=>setUpside(e.target.value)}
            placeholder="44.6" type="number" step="any" style={inputStyle} />
        </div>
      </div>
      {error && <div style={{ fontSize:11, color:'var(--red)', marginBottom:8 }}>⚠ {error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={handleSave} style={{
          padding:'7px 16px', borderRadius:6, border:'none', cursor:'pointer',
          background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:600,
          display:'flex', alignItems:'center', gap:5,
        }}>
          <Check size={12} /> {initial ? 'Update' : 'Add position'}
        </button>
        <button onClick={onCancel} style={{
          padding:'7px 14px', borderRadius:6,
          border:'1px solid var(--border)', background:'transparent',
          cursor:'pointer', fontSize:12, color:'var(--txt-muted)',
          display:'flex', alignItems:'center', gap:5,
        }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

export default function PositionEditor({ onClose, onSaved }) {
  const [positions, setPositions] = useState(() => loadOverrides() ?? POSITIONS.map(p => ({ ...p })))
  const [editing,   setEditing]   = useState(null)    // position being edited
  const [adding,    setAdding]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const handleAdd = (pos) => {
    const next = [...positions.filter(p => p.ticker !== pos.ticker), pos]
    setPositions(next)
    setAdding(false)
  }

  const handleEdit = (pos) => {
    setEditing(pos)
    setAdding(false)
  }

  const handleUpdate = (updated) => {
    setPositions(prev => prev.map(p => p.ticker === updated.ticker ? updated : p))
    setEditing(null)
  }

  const handleDelete = (ticker) => {
    setPositions(prev => prev.filter(p => p.ticker !== ticker))
  }

  const handleSave = () => {
    saveOverrides(positions)
    setSaved(true)
    setTimeout(() => { setSaved(false); onSaved?.(); onClose?.() }, 1200)
  }

  const handleReset = () => {
    if (!confirmReset) return setConfirmReset(true)
    clearOverrides()
    setPositions(POSITIONS.map(p => ({ ...p })))
    setConfirmReset(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center',
      justifyContent:'center', background:'rgba(0,0,0,0.5)' }}
      onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', width:'100%', maxWidth:520,
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        border:'1px solid var(--border)', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:700, color:'var(--txt)' }}>Manage positions</span>
          <button onClick={onClose} style={{ background:'transparent', border:'none',
            cursor:'pointer', color:'var(--txt-muted)', display:'flex', alignItems:'center' }}>
            <X size={16} />
          </button>
        </div>

        {/* Form (add or edit) */}
        {adding && <PositionForm onSave={handleAdd} onCancel={() => setAdding(false)} />}
        {editing && <PositionForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}

        {/* Position list */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {positions.length === 0 && (
            <div style={{ padding:'24px', textAlign:'center', color:'var(--txt-muted)', fontSize:13 }}>
              No positions. Add one above.
            </div>
          )}
          {positions.map(pos => (
            <PositionRow key={pos.ticker} pos={pos} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)',
          display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => { setAdding(true); setEditing(null) }} style={{
            padding:'8px 14px', borderRadius:6, border:'1px dashed var(--border)',
            background:'transparent', cursor:'pointer', color:'var(--accent)', fontSize:12,
            fontWeight:600, display:'flex', alignItems:'center', gap:5,
          }}>
            <Plus size={12} /> Add position
          </button>
          <div style={{ flex:1 }} />
          <button onClick={handleReset} style={{
            padding:'8px 12px', borderRadius:6,
            border:`1px solid ${confirmReset ? 'var(--red)' : 'var(--border)'}`,
            background: confirmReset ? 'var(--red-dim)' : 'transparent',
            cursor:'pointer', fontSize:12, color: confirmReset ? 'var(--red)' : 'var(--txt-muted)',
          }}>
            {confirmReset ? 'Confirm clear' : 'Clear all positions'}
          </button>
          <button onClick={handleSave} style={{
            padding:'8px 16px', borderRadius:6, border:'none',
            background: saved ? 'var(--green-dim)' : 'var(--accent)',
            color: saved ? 'var(--green)' : '#fff',
            cursor:'pointer', fontSize:12, fontWeight:700,
          }}>
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
