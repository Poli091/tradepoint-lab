/**
 * MODULE: conviction/valuation/
 * Valuation scoring — 15 pts, ONE metric used (priority cascade).
 *
 * Priority: PEG → EV/FCF → EV/EBITDA → P/E
 * Only the first available metric is scored.
 * This avoids double-counting valuation signals.
 *
 * Each strategy exports: { metric, isAvailable(f), score(f), value(f) }
 */

/* ─── PEG ───────────────────────────────────────────────── */
export const PEG = {
  metric: 'PEG',
  isAvailable: (f) => f.peg != null && f.peg > 0,
  value: (f) => f.peg,
  score: (f) => {
    const v = f.peg
    if (v < 0.5)  return 15  // exceptional growth at bargain price
    if (v < 1.0)  return 13  // undervalued vs growth
    if (v < 1.5)  return 10  // fairly valued
    if (v < 2.0)  return 7   // slightly expensive
    if (v < 3.0)  return 4   // expensive
    return 1                  // very expensive (still 1 to not kill growth cos)
  },
}

/* ─── EV / FCF ──────────────────────────────────────────── */
export const EV_FCF = {
  metric: 'EV/FCF',
  isAvailable: (f) => f.evFcf != null && f.evFcf > 0,
  value: (f) => f.evFcf,
  score: (f) => {
    const v = f.evFcf
    if (v < 15)  return 15
    if (v < 25)  return 12
    if (v < 35)  return 9
    if (v < 50)  return 6
    if (v < 75)  return 3
    return 1
  },
}

/* ─── EV / EBITDA ───────────────────────────────────────── */
export const EV_EBITDA = {
  metric: 'EV/EBITDA',
  isAvailable: (f) => f.evEbitda != null && f.evEbitda > 0,
  value: (f) => f.evEbitda,
  score: (f) => {
    const v = f.evEbitda
    if (v < 10)  return 15
    if (v < 15)  return 12
    if (v < 20)  return 9
    if (v < 25)  return 6
    if (v < 35)  return 3
    return 1
  },
}

/* ─── P/E ───────────────────────────────────────────────── */
export const PE = {
  metric: 'P/E',
  isAvailable: (f) => f.pe != null && f.pe > 0,
  value: (f) => f.pe,
  score: (f) => {
    const v = f.pe
    if (v < 10)  return 15
    if (v < 15)  return 12
    if (v < 20)  return 9
    if (v < 30)  return 6
    if (v < 50)  return 3
    return 1
  },
}

/* ─── Orchestrator ──────────────────────────────────────── */
const PRIORITY = [PEG, EV_FCF, EV_EBITDA, PE]

export function scoreValuation(ctx) {
  const f = ctx.fundamentals

  for (const strategy of PRIORITY) {
    if (strategy.isAvailable(f)) {
      const raw = strategy.score(f)
      return {
        score:     raw,
        max:       15,
        metric:    strategy.metric,
        value:     strategy.value(f),
        nullFields: 0,
        components: {
          [strategy.metric]: { raw, max: 15, value: strategy.value(f) },
        },
      }
    }
  }

  // No metric available
  return { score: null, max: 15, metric: null, value: null, nullFields: 1, components: {} }
}
