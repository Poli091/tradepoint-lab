/**
 * MODULE: DATA / earnings.js
 * Earnings catalyst calendar with decision types.
 * types: 'catalyst' | 'decision' | 'critical' | 'monitor'
 */

export const EARNINGS = [
  { ticker: 'APP',  date: 'Jul 29', daysLeft: 25, type: 'catalyst',  note: 'Beat → add to 9–10%; miss → exit, enter UBER or CRM' },
  { ticker: 'FICO', date: 'Jul 29', daysLeft: 25, type: 'decision',  note: 'Beat EPS $12+, then decide swap to SE or MSFT' },
  { ticker: 'PLTR', date: 'Aug 3',  daysLeft: 30, type: 'monitor',   note: 'Monitor — weight held at ~4.9%' },
  { ticker: 'MELI', date: 'Aug 5',  daysLeft: 32, type: 'critical',  note: '⚠ Critical: GMV decel or credit margin hit → exit both accounts' },
  { ticker: 'VST',  date: 'Aug 6',  daysLeft: 33, type: 'monitor',   note: 'Monitor nuclear capacity guidance' },
  { ticker: 'PODD', date: 'Aug 6',  daysLeft: 33, type: 'catalyst',  note: 'Confirm recall has no financial impact; miss → evaluate VRTX' },
]
