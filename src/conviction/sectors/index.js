/**
 * MODULE: conviction/sectors/
 * Sector-specific scoring thresholds for Financial Strength.
 * Only brackets change — the algorithm stays identical across all sectors.
 *
 * Bracket format:
 *   type:'max' → pts awarded when value <= threshold (lower is better, e.g. D/E)
 *   type:'min' → pts awarded when value >= threshold (higher is better, e.g. Current Ratio)
 */

/* ─── Default ──────────────────────────────────────────── */
export const DEFAULT = {
  name: 'default',
  gate1DebtMax: 4,
  strengthBrackets: {
    debtEquity: [
      { threshold: 0.5,      type: 'max', pts: 5 },
      { threshold: 1.0,      type: 'max', pts: 4 },
      { threshold: 2.0,      type: 'max', pts: 3 },
      { threshold: 4.0,      type: 'max', pts: 1 },
      { threshold: Infinity, type: 'max', pts: 0 },
    ],
    currentRatio: [
      { threshold: 2.0, type: 'min', pts: 5 },
      { threshold: 1.5, type: 'min', pts: 4 },
      { threshold: 1.0, type: 'min', pts: 3 },
      { threshold: 0.8, type: 'min', pts: 1 },
    ],
    interestCoverage: [
      { threshold: 10, type: 'min', pts: 5 },
      { threshold: 5,  type: 'min', pts: 4 },
      { threshold: 3,  type: 'min', pts: 3 },
      { threshold: 1,  type: 'min', pts: 1 },
    ],
  },
}

/* ─── Utilities ────────────────────────────────────────── */
export const UTILITIES = {
  name: 'utilities',
  gate1DebtMax: 6,
  strengthBrackets: {
    debtEquity: [
      { threshold: 1.5,      type: 'max', pts: 5 },
      { threshold: 2.5,      type: 'max', pts: 4 },
      { threshold: 4.0,      type: 'max', pts: 3 },
      { threshold: 6.0,      type: 'max', pts: 1 },
      { threshold: Infinity, type: 'max', pts: 0 },
    ],
    currentRatio: [
      { threshold: 1.2, type: 'min', pts: 5 },
      { threshold: 1.0, type: 'min', pts: 4 },
      { threshold: 0.8, type: 'min', pts: 3 },
      { threshold: 0.6, type: 'min', pts: 1 },
    ],
    interestCoverage: [
      { threshold: 3.0, type: 'min', pts: 5 },
      { threshold: 2.0, type: 'min', pts: 4 },
      { threshold: 1.5, type: 'min', pts: 3 },
      { threshold: 1.0, type: 'min', pts: 1 },
    ],
  },
}

/* ─── REIT ─────────────────────────────────────────────── */
export const REIT = {
  name: 'reit',
  gate1DebtMax: 10,
  strengthBrackets: {
    debtEquity: [
      { threshold: 3.0,      type: 'max', pts: 5 },
      { threshold: 5.0,      type: 'max', pts: 4 },
      { threshold: 8.0,      type: 'max', pts: 3 },
      { threshold: 10.0,     type: 'max', pts: 1 },
      { threshold: Infinity, type: 'max', pts: 0 },
    ],
    currentRatio: [
      { threshold: 1.5, type: 'min', pts: 5 },
      { threshold: 1.0, type: 'min', pts: 4 },
      { threshold: 0.8, type: 'min', pts: 3 },
      { threshold: 0.5, type: 'min', pts: 1 },
    ],
    interestCoverage: [
      { threshold: 3.0, type: 'min', pts: 5 },
      { threshold: 2.0, type: 'min', pts: 4 },
      { threshold: 1.5, type: 'min', pts: 3 },
      { threshold: 1.0, type: 'min', pts: 1 },
    ],
  },
}

/* ─── Banks ─────────────────────────────────────────────── */
// Financial Strength is not scored for banks in v1.0.
// D/E, Current Ratio, Interest Coverage are structurally
// incomparable across banking and non-banking companies.
// Future v2.0: CET1, Tier 1 Capital, Efficiency Ratio.
export const BANKS = {
  name: 'banks',
  gate1DebtMax: null,      // D/E gate not applied to banks
  strengthBrackets: null,  // Not applicable in v1.0
  warning: 'Financial Strength not scored for Banks in v1.0. Confidence reduced.',
}

/* ─── Router ────────────────────────────────────────────── */
const SECTOR_MAP = {
  'Utilities':   UTILITIES,
  'Real Estate': REIT,
  'Financials':  BANKS,
}

export function getSectorProfile(sector) {
  return SECTOR_MAP[sector] ?? DEFAULT
}
