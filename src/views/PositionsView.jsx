/**
 * MODULE: VIEWS / PositionsView.jsx
 * Full-page positions view with sortable table.
 */

import PositionsTable from '../components/widgets/PositionsTable.jsx'

export default function PositionsView({
  visiblePositions, sortBy, sortDir, handleSort,
  ticker, setTicker,
  convictionResults = {}, convictionLoading = false,
}) {
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 16 }}>
        All positions
      </h1>
      <PositionsTable
        positions={visiblePositions}
        sortBy={sortBy} sortDir={sortDir} onSort={handleSort}
        selectedTicker={ticker} onSelectTicker={setTicker}
      />
    </div>
  )
}
