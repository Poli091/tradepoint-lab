/**
 * MODULE: LAYOUT / Sidebar.jsx
 * Desktop: left rail with nav — collapsible (icon only) or expanded (icon + label).
 * Mobile:  fixed bottom navigation bar.
 * Preference saved to localStorage key 'sidebarExpanded'.
 */

import { useState, useEffect } from 'react'
import { LayoutDashboard, Briefcase, Eye, CalendarDays, BarChart3, Search, Settings, Sun, Moon, PieChart, GitCompare, Globe, ChevronRight, ChevronLeft } from 'lucide-react'
import { useBreakpoint } from '../../hooks/useBreakpoint.js'
import { useLang }        from '../../context/LanguageContext.jsx'

function NavButton({ label, Icon, active, onClick, expanded }) {
  return (
    <button
      onClick={onClick}
      title={expanded ? undefined : label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      style={{
        width: expanded ? '100%' : 44,
        height: 44,
        borderRadius: 'var(--radius-lg)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: expanded ? 'flex-start' : 'center',
        gap: expanded ? 10 : 0,
        padding: expanded ? '0 12px' : 0,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color:      active ? 'var(--accent)'     : 'var(--txt-muted)',
        boxShadow: active ? 'inset 0 0 0 1px var(--accent-glow)' : 'none',
        transition: 'all 0.14s',
        textAlign: 'left',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--surface-up)'; e.currentTarget.style.color = 'var(--txt-sec)' }}}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent';       e.currentTarget.style.color = 'var(--txt-muted)' }}}
    >
      <Icon size={19} style={{ flexShrink: 0 }} />
      {expanded && (
        <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {label}
        </span>
      )}
    </button>
  )
}

function IconBtn({ label, Icon, onClick, color, bg, expanded }) {
  return (
    <button
      onClick={onClick}
      title={expanded ? undefined : label}
      aria-label={label}
      style={{
        width: expanded ? '100%' : 44,
        height: 44,
        borderRadius: 'var(--radius-lg)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: expanded ? 'flex-start' : 'center',
        gap: expanded ? 10 : 0,
        padding: expanded ? '0 12px' : 0,
        background: bg || 'transparent',
        color: color || 'var(--txt-muted)',
        transition: 'all 0.14s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.color = color || 'var(--accent)'; e.currentTarget.style.background = 'var(--surface-up)' }}
      onMouseLeave={e => { e.currentTarget.style.color = color || 'var(--txt-muted)'; e.currentTarget.style.background = bg || 'transparent' }}
    >
      <Icon size={18} style={{ flexShrink: 0 }} />
      {expanded && (
        <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      )}
    </button>
  )
}

export default function Sidebar({ view, setView, theme, toggleTheme, onOpenSettings }) {
  const { isMobile } = useBreakpoint()
  const { t }        = useLang()
  const isLight      = theme === 'light'

  // Persist expanded state — default collapsed
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem('sidebarExpanded') === 'true'
  )
  useEffect(() => {
    localStorage.setItem('sidebarExpanded', expanded)
    // Update CSS variable so content area adjusts
    document.documentElement.style.setProperty('--sidebar-w', expanded ? '160px' : '64px')
  }, [expanded])

  const NAV_ITEMS = [
    { id: 'dashboard',   label: t.navDashboard,   Icon: LayoutDashboard },
    { id: 'positions',   label: t.navPositions,   Icon: Briefcase       },
    { id: 'watchlist',   label: t.navWatchlist,   Icon: Eye             },
    { id: 'scan',        label: t.navScanner,     Icon: Search          },
    { id: 'market',      label: 'Market Map',     Icon: Globe,  desktopOnly: true },
    { id: 'compare',     label: t.navCompare,     Icon: GitCompare, desktopOnly: true },
    { id: 'calendar',    label: t.navCalendar,    Icon: CalendarDays    },
    { id: 'insights',    label: t.navInsights,    Icon: PieChart,   desktopOnly: true },
    { id: 'diagnostics', label: t.navDiag,        Icon: BarChart3,  desktopOnly: true },
  ]
  const MOBILE_NAV = NAV_ITEMS.filter(n => !n.desktopOnly)

  /* ── Mobile: fixed bottom nav bar + More drawer ── */
  const [moreOpen, setMoreOpen] = useState(false)

  // Extra sections not in primary nav
  const MORE_ITEMS = NAV_ITEMS.filter(n => n.desktopOnly)

  if (isMobile) {
    return (
      <>
        {/* More drawer overlay */}
        {moreOpen && (
          <div
            onClick={() => setMoreOpen(false)}
            style={{ position:'fixed', inset:0, zIndex:199, background:'rgba(0,0,0,0.5)' }}
          />
        )}

        {/* More drawer */}
        {moreOpen && (
          <div style={{
            position: 'fixed', bottom: 58, left: 0, right: 0, zIndex: 200,
            background: 'var(--surface)', borderTop: '1px solid var(--border)',
            padding: '12px 8px 8px', borderRadius: '16px 16px 0 0',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
          }}>
            {/* Section label */}
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-muted)',
              textTransform: 'uppercase', letterSpacing: '0.07em',
              padding: '0 8px 8px' }}>More</div>

            {/* Extra views */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {MORE_ITEMS.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => { setView(id); setMoreOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                    background: view === id ? 'var(--accent-dim)' : 'transparent',
                    color: view === id ? 'var(--accent)' : 'var(--txt)',
                    border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                  }}>
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />

            {/* Settings + Theme */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button onClick={() => { onOpenSettings(); setMoreOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                  background: 'transparent', color: 'var(--txt)',
                  border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                <Settings size={18} />
                Settings & Import/Export
              </button>
              <button onClick={() => { toggleTheme(); setMoreOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                  background: 'transparent',
                  color: isLight ? 'var(--amber)' : 'var(--txt)',
                  border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                {isLight ? <Sun size={18} /> : <Moon size={18} />}
                {isLight ? 'Dark mode' : 'Light mode'}
              </button>
            </div>
          </div>
        )}

        {/* Bottom nav bar */}
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          height: 58, background: 'var(--surface)', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-around',
          padding: '0 4px',
        }}>
          {MOBILE_NAV.map(({ id, label, Icon }) => (
            <NavButton key={id} label={label} Icon={Icon}
              active={view === id && !moreOpen}
              onClick={() => { setView(id); setMoreOpen(false) }}
              expanded={false} />
          ))}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(o => !o)}
            style={{
              width: 44, height: 44, borderRadius: 'var(--radius-lg)', border: 'none',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              background: moreOpen ? 'var(--accent-dim)' : 'transparent',
              color: moreOpen ? 'var(--accent)' : 'var(--txt-muted)',
            }}>
            <div style={{ display:'flex', gap:3 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:4, height:4, borderRadius:'50%',
                  background: 'currentColor' }} />
              ))}
            </div>
          </button>
        </nav>
      </>
    )
  }

  /* ── Desktop: left sidebar ── */
  const sidebarW = expanded ? 160 : 64

  return (
    <aside style={{
      width: sidebarW, minWidth: sidebarW, height: '100vh',
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      alignItems: expanded ? 'stretch' : 'center',
      paddingTop: 14, paddingBottom: 14,
      gap: 2, flexShrink: 0,
      transition: 'width 0.18s ease, min-width 0.18s ease',
      overflow: 'hidden',
    }}>
      {/* Logo + toggle */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: expanded ? 'space-between' : 'center',
        padding: expanded ? '0 10px 14px' : '0 0 14px',
        gap: 8,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-lg)', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), var(--purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: '#fff',
        }}>TP</div>
        {expanded && (
          <button onClick={() => setExpanded(false)} title="Collapse sidebar"
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--txt-muted)', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%',
        padding: expanded ? '0 8px' : 0, alignItems: expanded ? 'stretch' : 'center' }}>
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <NavButton key={id} label={label} Icon={Icon} active={view === id}
            onClick={() => setView(id)} expanded={expanded} />
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%',
        padding: expanded ? '0 8px' : 0, alignItems: expanded ? 'stretch' : 'center' }}>
        <IconBtn label={t.navSettings} Icon={Settings} onClick={onOpenSettings} expanded={expanded} />
        <IconBtn
          label={isLight ? 'Dark mode' : 'Light mode'}
          Icon={isLight ? Sun : Moon}
          color={isLight ? 'var(--amber)' : undefined}
          onClick={toggleTheme}
          expanded={expanded}
        />
        {/* Expand button when collapsed */}
        {!expanded && (
          <button onClick={() => setExpanded(true)} title="Expand sidebar"
            style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 'var(--radius-lg)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--surface-up)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt-muted)'; e.currentTarget.style.background = 'none' }}>
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </aside>
  )
}
