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
  riskDebtMax:  3.0,   // D/E above this triggers Risk penalty
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
  riskDebtMax:  5.0,   // Utilities can carry more debt — penalty threshold higher than default
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
  riskDebtMax:  8.0,   // REITs are capital-intensive by nature
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
// Ticker-level overrides — highest priority, beats both ETF and sector maps.
// Used for companies whose GICS sector doesn't reflect their financial structure.
// e.g. VST/CEG are classified as "Energy" but operate as power/utility companies.
const TICKER_OVERRIDES = {
  'VST':  UTILITIES,   // Vistra Energy — power generator, utility financial structure
  'CEG':  UTILITIES,   // Constellation Energy — nuclear power, utility structure
  'NEE':  UTILITIES,   // NextEra Energy
  'NRG':  UTILITIES,   // NRG Energy
  'ETR':  UTILITIES,   // Entergy
  'OKLO': UTILITIES,   // Oklo — nuclear SMR
  'SMR':  UTILITIES,   // NuScale Power
  'VRT':  DEFAULT,     // Vertiv — data center infra, default profile
}

// Primary: sector name
const SECTOR_MAP = {
  'Utilities':   UTILITIES,
  'Real Estate': REIT,
  'Financials':  BANKS,
}

// Secondary: sector ETF (more accurate for edge cases)
// e.g. VST/CEG are tagged 'Energy' sector but trade as XLU (Utilities ETF)
const ETF_MAP = {
  'XLU':  UTILITIES,   // Utilities ETF — applies to power generators (VST, CEG, NEE)
  'XLRE': REIT,        // Real Estate ETF
  'XLF':  BANKS,       // Financials ETF
}

/**
 * @param {string} sector    - GICS sector name from tickerUniverse
 * @param {string} sectorEtf - ETF ticker from tickerUniverse
 * @param {string} ticker    - ticker symbol (highest priority override)
 */
export function getSectorProfile(sector, sectorEtf = '', ticker = '') {
  return TICKER_OVERRIDES[ticker] ?? ETF_MAP[sectorEtf] ?? SECTOR_MAP[sector] ?? DEFAULT
}
