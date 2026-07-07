-- TradePoint Lab — D1 Schema v1.0
-- One row per conviction analysis.
-- Flat structure (no joins) for easy backtesting queries.
--
-- Deploy with:
--   npx wrangler d1 execute tradepoint-db --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS analyses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker          TEXT    NOT NULL,
  analysis_date   TEXT    NOT NULL,   -- YYYY-MM-DD
  timestamp_ms    INTEGER NOT NULL,   -- Unix milliseconds

  -- Score pipeline (preserved for backtesting)
  raw_score        REAL,
  risk_penalty     REAL,
  final_score      REAL,
  gate_cap         INTEGER,
  active_gate      TEXT,

  -- Verdict
  grade            TEXT,
  confidence       INTEGER,
  model_version    TEXT DEFAULT 'v1.0',

  -- Dimension breakdown
  growth_score     REAL,
  quality_score    REAL,
  strength_score   REAL,
  valuation_score  REAL,
  technical_score  REAL,
  valuation_metric TEXT,

  -- Market context at analysis time
  price           REAL,
  spy_price       REAL,

  -- Wall Street consensus
  target_mean     REAL,
  upside_pct      REAL,
  analysts        INTEGER,

  -- Technical snapshot
  rsi             REAL,
  ema200          REAL,
  rs_weighted     REAL,

  -- Meta
  sector_profile  TEXT,
  null_fields     INTEGER,

  -- Full result (for future features / debugging)
  full_json       TEXT
);

-- Indexes for common backtesting queries
CREATE INDEX IF NOT EXISTS idx_ticker      ON analyses(ticker);
CREATE INDEX IF NOT EXISTS idx_date        ON analyses(analysis_date);
CREATE INDEX IF NOT EXISTS idx_grade       ON analyses(grade);
CREATE INDEX IF NOT EXISTS idx_ticker_date ON analyses(ticker, analysis_date);

-- Example backtesting queries:
--
-- All STRONG BUY signals in the last 6 months:
--   SELECT ticker, analysis_date, final_score, price
--   FROM analyses WHERE grade='STRONG BUY' AND analysis_date >= date('now','-6 months');
--
-- Average score by sector profile:
--   SELECT sector_profile, AVG(final_score), COUNT(*)
--   FROM analyses GROUP BY sector_profile;
--
-- Score history for a ticker:
--   SELECT analysis_date, final_score, grade, growth_score, valuation_score
--   FROM analyses WHERE ticker='NVDA' ORDER BY analysis_date;
--
-- Which component correlates most with grade over time:
--   SELECT grade, AVG(growth_score), AVG(quality_score), AVG(valuation_score), AVG(technical_score)
--   FROM analyses GROUP BY grade;
