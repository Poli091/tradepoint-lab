/**
 * WatchlistEditor.jsx — add/edit/delete watchlist items
 */
import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { loadWatchlist, saveWatchlist, clearWatchlist } from '../../utils/watchlistStorage.js'
import { WATCHLIST } from '../../data/watchlist.js'
import { fUSD } from '../../utils/format.js'

const PRIORITIES = ['high', 'med', 'low']

function ItemRow({ item, onEdit, onDelete }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8,
      padding:'8px 12px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ flex:1 }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--txt)' }}>{item.ticker}</span>
        <span style={{ fontSize:11, color:'var(--txt-muted)', marginLeft:8 }}>{item.name}</span>
      </div>
      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:4, fontWeight:700,
        background: item.priority==='high' ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)',
        color:      item.priority==='high' ? '#F87171'              : '#FCD34D' }}>
        {item.priority?.toUpperCase()}
      </span>
      {item.upside != null && (
        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--green)', fontWeight:600 }}>
          +{item.upside.toFixed(1)}%
        </span>
      )}
      <button onClick={() => onEdit(item)} style={{ background:'transparent', border:'none',
        cursor:'pointer', color:'var(--txt-muted)', padding:4, display:'flex', alignItems:'center' }}>
        <Pencil size={12} />
      </button>
      <button onClick={() => onDelete(item.ticker)} style={{ background:'transparent', border:'none',
        cursor:'pointer', color:'var(--red)', padding:4, display:'flex', alignItems:'center' }}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function ItemForm({ initial, onSave, onCancel }) {
  const [ticker,   setTicker]   = useState(initial?.ticker   ?? '')
  const [name,     setName]     = useState(initial?.name     ?? '')
  const [priority, setPriority] = useState(initial?.priority ?? 'med')
  const [upside,   setUpside]   = useState(initial?.upside   ?? '')
  const [error,    setError]    = useState('')

  const handleSave = () => {
    const t = ticker.trim().toUpperCase()
    if (!t) return setError('Ticker is required')
    setError('')
    onSave({
      ticker: t,
      name:   name.trim() || t,
      priority,
      upside:       upside !== '' ? parseFloat(upside) : null,
      currentPrice: 0,
      dayChangePct: null,
    })
  }

  const inp = {
    padding:'7px 10px', boxSizing:'border-box',
    background:'var(--surface-up)', border:'1px solid var(--border)',
    borderRadius:6, color:'var(--txt)', fontSize:12, fontFamily:'var(--mono)', width:'100%',
  }
  const lbl = { fontSize:10, color:'var(--txt-muted)', fontWeight:600,
    textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4, display:'block' }

  return (
    <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <label style={lbl}>Ticker *</label>
          <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())}
            placeholder="SE" style={inp} />
        </div>
        <div>
          <label style={lbl}>Company name</label>
          <input value={name} onChange={e=>setName(e.target.value)}
            placeholder="Sea Limited" style={inp} />
        </div>
        <div>
          <label style={lbl}>Priority</label>
          <select value={priority} onChange={e=>setPriority(e.target.value)}
            style={{ ...inp, cursor:'pointer' }}>
            <option value="high">High</option>
            <option value="med">Watch</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Analyst upside %</label>
          <input value={upside} onChange={e=>setUpside(e.target.value)}
            placeholder="69.4" type="number" step="any" style={inp} />
        </div>
      </div>
      {error && <div style={{ fontSize:11, color:'var(--red)', marginBottom:8 }}>⚠ {error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={handleSave} style={{
          padding:'7px 16px', borderRadius:6, border:'none', cursor:'pointer',
          background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:600,
          display:'flex', alignItems:'center', gap:5 }}>
          <Check size={12} /> {initial ? 'Update' : 'Add to watchlist'}
        </button>
        <button onClick={onCancel} style={{
          padding:'7px 14px', borderRadius:6, border:'1px solid var(--border)',
          background:'transparent', cursor:'pointer', fontSize:12, color:'var(--txt-muted)',
          display:'flex', alignItems:'center', gap:5 }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

export default function WatchlistEditor({ onClose, onSaved }) {
  const [items,        setItems]        = useState(() => loadWatchlist() ?? [])
  const [editing,      setEditing]      = useState(null)
  const [adding,       setAdding]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const handleAdd    = (item) => { setItems(prev => [...prev.filter(i=>i.ticker!==item.ticker), item]); setAdding(false) }
  const handleUpdate = (item) => { setItems(prev => prev.map(i => i.ticker===item.ticker ? item : i)); setEditing(null) }
  const handleDelete = (t)    => setItems(prev => prev.filter(i => i.ticker !== t))

  const handleSave = () => {
    saveWatchlist(items)
    setSaved(true)
    setTimeout(() => { setSaved(false); onSaved?.(); onClose?.() }, 1200)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center',
      justifyContent:'center', background:'rgba(0,0,0,0.5)' }}
      onClick={e => e.target===e.currentTarget && onClose?.()}>
      <div style={{ background:'var(--surface)', borderRadius:12, width:'100%', maxWidth:500,
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        border:'1px solid var(--border)', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', overflow:'hidden' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:700, color:'var(--txt)' }}>Manage watchlist</span>
          <button onClick={onClose} style={{ background:'transparent', border:'none',
            cursor:'pointer', color:'var(--txt-muted)', display:'flex', alignItems:'center' }}>
            <X size={16} />
          </button>
        </div>

        {adding  && <ItemForm onSave={handleAdd}    onCancel={() => setAdding(false)}  />}
        {editing && <ItemForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}

        <div style={{ flex:1, overflowY:'auto' }}>
          {items.length === 0 && (
            <div style={{ padding:'24px', textAlign:'center', color:'var(--txt-muted)', fontSize:13 }}>
              No watchlist items yet. Add one above.
            </div>
          )}
          {items.map(item => (
            <ItemRow key={item.ticker} item={item} onEdit={setEditing} onDelete={handleDelete} />
          ))}
        </div>

        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)',
          display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => { setAdding(true); setEditing(null) }} style={{
            padding:'8px 14px', borderRadius:6, border:'1px dashed var(--border)',
            background:'transparent', cursor:'pointer', color:'var(--accent)', fontSize:12,
            fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
            <Plus size={12} /> Add ticker
          </button>
          <div style={{ flex:1 }} />
          <button onClick={() => { if(!confirmClear){setConfirmClear(true)}else{clearWatchlist();setItems([]);setConfirmClear(false)} }} style={{
            padding:'8px 12px', borderRadius:6,
            border:`1px solid ${confirmClear?'var(--red)':'var(--border)'}`,
            background: confirmClear?'var(--red-dim)':'transparent',
            cursor:'pointer', fontSize:12,
            color: confirmClear?'var(--red)':'var(--txt-muted)' }}>
            {confirmClear ? 'Confirm clear' : 'Clear all'}
          </button>
          <button onClick={handleSave} style={{
            padding:'8px 16px', borderRadius:6, border:'none',
            background: saved?'var(--green-dim)':'var(--accent)',
            color: saved?'var(--green)':'#fff',
            cursor:'pointer', fontSize:12, fontWeight:700 }}>
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
