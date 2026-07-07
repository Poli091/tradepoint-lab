-- TradePoint Lab — Snapshots Schema
-- Weekly automated snapshots via Cron Trigger
-- Run: npx wrangler d1 execute tradepoint-db --remote --command="..."

CREATE TABLE IF NOT EXISTS snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker          TEXT    NOT NULL,
  snapshot_date   TEXT    NOT NULL,   -- YYYY-MM-DD (Sunday)
  price           REAL,
  score           REAL,
  grade           TEXT,
  confidence      INTEGER,
  raw_score       REAL,
  risk_penalty    REAL,
  active_gate     TEXT,
  growth_score    REAL,
  quality_score   REAL,
  strength_score  REAL,
  valuation_score REAL,
  technical_score REAL,
  rsi             REAL,
  ema200          REAL,
  above_ema200    INTEGER,            -- 1 = true, 0 = false
  rs_weighted     REAL,
  upside_pct      REAL,
  analysts        INTEGER,
  sector_profile  TEXT,
  model_version   TEXT DEFAULT 'v1.0',
  breakdown_json  TEXT,
  UNIQUE(ticker, snapshot_date)       -- one snapshot per ticker per week
);

CREATE INDEX IF NOT EXISTS idx_snap_ticker ON snapshots(ticker);
CREATE INDEX IF NOT EXISTS idx_snap_date   ON snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snap_grade  ON snapshots(grade);

-- Backtest results — populated later when comparing snapshots to actual returns
CREATE TABLE IF NOT EXISTS backtest_results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker          TEXT    NOT NULL,
  signal_date     TEXT    NOT NULL,
  score           REAL,
  grade           TEXT,
  price_at_signal REAL,
  return_1m       REAL,
  return_3m       REAL,
  return_6m       REAL,
  return_12m      REAL,
  spy_return_1m   REAL,
  spy_return_3m   REAL,
  spy_return_6m   REAL,
  spy_return_12m  REAL,
  alpha_1m        REAL,
  alpha_3m        REAL,
  alpha_6m        REAL,
  alpha_12m       REAL,
  computed_at     TEXT
);
