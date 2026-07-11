-- Migration: fix analyses table to use UPSERT pattern
-- Replaces the threshold-based dedup with a UNIQUE(ticker, analysis_date)
-- constraint so each ticker-day always holds the latest analysis only.
-- Run once:
--   npx wrangler d1 execute tradepoint-db --remote --file=worker/schema_migration_analyses_v2.sql

-- Step 1: new table with correct unique key
CREATE TABLE IF NOT EXISTS _analyses_v2 (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker          TEXT    NOT NULL,
  analysis_date   TEXT    NOT NULL,
  timestamp_ms    INTEGER NOT NULL,
  raw_score       REAL, risk_penalty REAL, final_score REAL,
  gate_cap        INTEGER, active_gate TEXT,
  grade           TEXT, confidence INTEGER, model_version TEXT DEFAULT 'v1.0',
  growth_score    REAL, quality_score REAL, strength_score REAL,
  valuation_score REAL, technical_score REAL, valuation_metric TEXT,
  price           REAL, spy_price REAL,
  target_mean     REAL, upside_pct REAL, analysts INTEGER,
  rsi             REAL, ema200 REAL, rs_weighted REAL,
  sector_profile  TEXT, null_fields INTEGER, full_json TEXT,
  UNIQUE(ticker, analysis_date)   -- one canonical row per ticker per day
);

-- Step 2: copy deduplicated data (latest timestamp per ticker+date)
INSERT OR IGNORE INTO _analyses_v2 (
  ticker, analysis_date, timestamp_ms,
  raw_score, risk_penalty, final_score, gate_cap, active_gate,
  grade, confidence, model_version,
  growth_score, quality_score, strength_score, valuation_score, technical_score, valuation_metric,
  price, spy_price, target_mean, upside_pct, analysts,
  rsi, ema200, rs_weighted, sector_profile, null_fields, full_json
)
SELECT
  a.ticker, a.analysis_date, a.timestamp_ms,
  a.raw_score, a.risk_penalty, a.final_score, a.gate_cap, a.active_gate,
  a.grade, a.confidence, a.model_version,
  a.growth_score, a.quality_score, a.strength_score, a.valuation_score, a.technical_score, a.valuation_metric,
  a.price, a.spy_price, a.target_mean, a.upside_pct, a.analysts,
  a.rsi, a.ema200, a.rs_weighted, a.sector_profile, a.null_fields, a.full_json
FROM analyses a
INNER JOIN (
  SELECT ticker, analysis_date, MAX(timestamp_ms) AS max_ts
  FROM analyses GROUP BY ticker, analysis_date
) latest ON a.ticker = latest.ticker
        AND a.analysis_date = latest.analysis_date
        AND a.timestamp_ms  = latest.max_ts;

-- Step 3: replace old table
DROP TABLE IF EXISTS analyses;
ALTER TABLE _analyses_v2 RENAME TO analyses;

-- Step 4: restore indexes
CREATE INDEX IF NOT EXISTS idx_ticker      ON analyses(ticker);
CREATE INDEX IF NOT EXISTS idx_date        ON analyses(analysis_date);
CREATE INDEX IF NOT EXISTS idx_grade       ON analyses(grade);
CREATE INDEX IF NOT EXISTS idx_ticker_date ON analyses(ticker, analysis_date);
