/**
 * EarningsEditor.jsx — add/edit/delete earnings calendar events
 */
import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { loadEarnings, saveEarnings, clearEarnings } from '../../utils/earningsStorage.js'

const TYPES = ['catalyst', 'decision', 'monitor', 'critical']
const TYPE_COLORS = {
  catalyst: 'var(--accent)',
  decision: '#A78BFA',
  monitor:  'var(--amber)',
  critical: 'var(--red)',
}

function EventRow({ event, onEdit, onDelete }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8,
      padding:'8px 12px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ flex:1 }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--txt)' }}>{event.ticker}</span>
        <span style={{ fontSize:10, marginLeft:8, padding:'1px 6px', borderRadius:4, fontWeight:700,
          background:`${TYPE_COLORS[event.type]}22`, color:TYPE_COLORS[event.type] }}>
          {event.type?.toUpperCase()}
        </span>
        <span style={{ fontSize:11, color:'var(--txt-muted)', marginLeft:8 }}>{event.date}</span>
        {event.note && <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:2 }}>{event.note}</div>}
      </div>
      <button onClick={() => onEdit(event)} style={{ background:'transparent', border:'none',
        cursor:'pointer', color:'var(--txt-muted)', padding:4, display:'flex', alignItems:'center' }}>
        <Pencil size={12} />
      </button>
      <button onClick={() => onDelete(event.ticker)} style={{ background:'transparent', border:'none',
        cursor:'pointer', color:'var(--red)', padding:4, display:'flex', alignItems:'center' }}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function EventForm({ initial, onSave, onCancel }) {
  const [ticker, setTicker] = useState(initial?.ticker ?? '')
  const [date,   setDate]   = useState(initial?.date   ?? '')
  const [type,   setType]   = useState(initial?.type   ?? 'monitor')
  const [note,   setNote]   = useState(initial?.note   ?? '')
  const [upside, setUpside] = useState(initial?.analystUpside ?? '')
  const [error,  setError]  = useState('')

  const handleSave = () => {
    const t = ticker.trim().toUpperCase()
    if (!t)    return setError('Ticker is required')
    if (!date) return setError('Date is required')
    setError('')
    onSave({ ticker: t, date, type, note: note.trim(), analystUpside: upside !== '' ? parseFloat(upside) : null })
  }

  const inp = {
    padding:'7px 10px', boxSizing:'border-box', width:'100%',
    background:'var(--surface-up)', border:'1px solid var(--border)',
    borderRadius:6, color:'var(--txt)', fontSize:12, fontFamily:'var(--mono)',
  }
  const lbl = { fontSize:10, color:'var(--txt-muted)', fontWeight:600,
    textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4, display:'block' }

  return (
    <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
        <div>
          <label style={lbl}>Ticker *</label>
          <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())}
            placeholder="NVDA" style={inp} />
        </div>
        <div>
          <label style={lbl}>Date *</label>
          <input value={date} onChange={e=>setDate(e.target.value)}
            type="date" style={inp} />
        </div>
        <div>
          <label style={lbl}>Type</label>
          <select value={type} onChange={e=>setType(e.target.value)} style={{ ...inp, cursor:'pointer' }}>
            {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Analyst upside %</label>
          <input value={upside} onChange={e=>setUpside(e.target.value)}
            placeholder="44.6" type="number" step="any" style={inp} />
        </div>
      </div>
      <div style={{ marginBottom:10 }}>
        <label style={lbl}>Your thesis / action plan</label>
        <input value={note} onChange={e=>setNote(e.target.value)}
          placeholder="Beat → add; miss → exit" style={inp} />
      </div>
      {error && <div style={{ fontSize:11, color:'var(--red)', marginBottom:8 }}>⚠ {error}</div>}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={handleSave} style={{
          padding:'7px 16px', borderRadius:6, border:'none', cursor:'pointer',
          background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:600,
          display:'flex', alignItems:'center', gap:5 }}>
          <Check size={12} /> {initial ? 'Update' : 'Add event'}
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

export default function EarningsEditor({ onClose, onSaved }) {
  const [events,       setEvents]       = useState(() => loadEarnings() ?? [])
  const [editing,      setEditing]      = useState(null)
  const [adding,       setAdding]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const sorted = [...events].sort((a,b) => new Date(a.date) - new Date(b.date))

  const handleAdd    = (ev) => { setEvents(prev => [...prev.filter(e=>e.ticker!==ev.ticker), ev]); setAdding(false) }
  const handleUpdate = (ev) => { setEvents(prev => prev.map(e => e.ticker===ev.ticker ? ev : e)); setEditing(null) }
  const handleDelete = (t)  => setEvents(prev => prev.filter(e => e.ticker !== t))

  const handleSave = () => {
    saveEarnings(events)
    setSaved(true)
    setTimeout(() => { setSaved(false); onSaved?.(); onClose?.() }, 1200)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center',
      justifyContent:'center', background:'rgba(0,0,0,0.5)' }}
      onClick={e => e.target===e.currentTarget && onClose?.()}>
      <div style={{ background:'var(--surface)', borderRadius:'var(--radius-lg)', width:'100%', maxWidth:540,
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        border:'1px solid var(--border)', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', overflow:'hidden' }}>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <span style={{ fontSize:15, fontWeight:700, color:'var(--txt)' }}>Earnings calendar</span>
          <button onClick={onClose} style={{ background:'transparent', border:'none',
            cursor:'pointer', color:'var(--txt-muted)', display:'flex', alignItems:'center' }}>
            <X size={16} />
          </button>
        </div>

        {adding  && <EventForm onSave={handleAdd}    onCancel={() => setAdding(false)} />}
        {editing && <EventForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}

        <div style={{ flex:1, overflowY:'auto' }}>
          {sorted.length === 0 && (
            <div style={{ padding:'24px', textAlign:'center', color:'var(--txt-muted)', fontSize:13 }}>
              No earnings events yet. Add one above.
            </div>
          )}
          {sorted.map(ev => (
            <EventRow key={ev.ticker} event={ev} onEdit={setEditing} onDelete={handleDelete} />
          ))}
        </div>

        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)',
          display:'flex', gap:8, flexShrink:0 }}>
          <button onClick={() => { setAdding(true); setEditing(null) }} style={{
            padding:'8px 14px', borderRadius:6, border:'1px dashed var(--border)',
            background:'transparent', cursor:'pointer', color:'var(--accent)', fontSize:12,
            fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
            <Plus size={12} /> Add event
          </button>
          <div style={{ flex:1 }} />
          <button onClick={() => { if(!confirmClear){setConfirmClear(true)}else{clearEarnings();setEvents([]);setConfirmClear(false)} }} style={{
            padding:'8px 12px', borderRadius:6,
            border:`1px solid ${confirmClear?'var(--red)':'var(--border)'}`,
            background:confirmClear?'var(--red-dim)':'transparent',
            cursor:'pointer', fontSize:12, color:confirmClear?'var(--red)':'var(--txt-muted)' }}>
            {confirmClear ? 'Confirm clear' : 'Clear all'}
          </button>
          <button onClick={handleSave} style={{
            padding:'8px 16px', borderRadius:6, border:'none',
            background:saved?'var(--green-dim)':'var(--accent)',
            color:saved?'var(--green)':'#fff',
            cursor:'pointer', fontSize:12, fontWeight:700 }}>
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
