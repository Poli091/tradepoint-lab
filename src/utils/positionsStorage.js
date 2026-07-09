/**
 * positionsStorage.js
 * Local position overrides stored in localStorage.
 * Bridge before multi-user D1 implementation.
 *
 * Merges with the hardcoded positions.js:
 *   - User can add new positions
 *   - User can edit qty/avgPrice of existing ones
 *   - User can delete positions
 *   - Hard-coded positions are the fallback/initial state
 */

const LS_KEY = 'tp_positions_v1'

export function loadOverrides() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null   // null = use hardcoded defaults
  } catch { return null }
}

export function saveOverrides(positions) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(positions))
  } catch { /* storage full */ }
}

export function clearOverrides() {
  localStorage.removeItem(LS_KEY)
}
