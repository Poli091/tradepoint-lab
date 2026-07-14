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

  /* ── Mobile: fixed bottom nav bar ── */
  if (isMobile) {
    return (
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        height: 58, background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '0 8px',
      }}>
        {MOBILE_NAV.map(({ id, label, Icon }) => (
          <NavButton key={id} label={label} Icon={Icon} active={view === id} onClick={() => setView(id)} expanded={false} />
        ))}
        <IconBtn
          label={isLight ? 'Dark mode' : 'Light mode'}
          Icon={isLight ? Sun : Moon}
          color={isLight ? 'var(--amber)' : undefined}
          onClick={toggleTheme}
          expanded={false}
        />
      </nav>
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
