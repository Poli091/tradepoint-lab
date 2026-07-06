/**
 * MODULE: conviction/context.js
 * Builds the scoring context — a single object passed to every module.
 * Keeps scorer signatures clean: scoreGrowth(ctx), scoreQuality(ctx), etc.
 */

import { getSectorProfile } from './sectors/index.js'
import { getTicker }        from '../data/tickerUniverse.js'

/**
 * @param {object} fundamentals  - from Worker /api/fundamentals/:ticker
 * @param {object[]} ohlcv       - from Worker /api/ohlcv/:ticker/1Y  (oldest→newest)
 * @param {object[]} spyOhlcv    - from Worker /api/ohlcv/SPY/1Y      (for RS calculation)
 * @param {object} prices        - { [ticker]: { price, changePct, ... } }
 */
export function createContext({ fundamentals, ohlcv = [], spyOhlcv = [], prices = {} }) {
  const tickerMeta    = getTicker(fundamentals.ticker) ?? {}
  const sector        = tickerMeta.sector    ?? 'Information Technology'
  const sectorEtf     = tickerMeta.sectorEtf ?? ''
  const sectorProfile = getSectorProfile(sector, sectorEtf)

  return {
    fundamentals,
    ohlcv,
    spyOhlcv,
    prices,
    sector,
    sectorProfile,
  }
}
