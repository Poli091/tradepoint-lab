-- TradePoint Lab — Market Map Schema
-- Three tables for scalable S&P 500 universe tracking
--
-- Deploy with:
--   npx wrangler d1 execute tradepoint-db --file=worker/schema_market_map.sql

-- ── 1. Constituent Master ─────────────────────────────────────────────────
-- Source of truth for S&P 500 / SPY universe
-- One row per security (share classes kept separate for accurate SPY weight)
-- company_id groups share classes for industry median deduplication

CREATE TABLE IF NOT EXISTS constituent_master (
  symbol              TEXT    PRIMARY KEY,
  company_id          TEXT    NOT NULL,        -- groups GOOG + GOOGL under same company
  company_name        TEXT,
  sector              TEXT    NOT NULL,
  industry            TEXT    NOT NULL,
  spy_weight          REAL,                    -- % of SPY as of last import
  active_from         TEXT,                    -- YYYY-MM-DD (null = always active)
  active_to           TEXT,                    -- YYYY-MM-DD (null = still active)
  constituent_version TEXT    DEFAULT 'v1.0',  -- version of this import
  source              TEXT    DEFAULT 'manual',-- 'spy_csv' | 'manual' | 'script'
  updated_at          TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE INDEX IF NOT EXISTS idx_cm_sector   ON constituent_master(sector);
CREATE INDEX IF NOT EXISTS idx_cm_industry ON constituent_master(industry);
CREATE INDEX IF NOT EXISTS idx_cm_company  ON constituent_master(company_id);
CREATE INDEX IF NOT EXISTS idx_cm_active   ON constituent_master(active_to);

-- ── 2. Daily RS per Security ──────────────────────────────────────────────
-- One row per (date, symbol) — only derived RS values, not raw OHLCV
-- This keeps storage small: ~500 rows/day vs 130,000 OHLCV rows

CREATE TABLE IF NOT EXISTS market_rs_daily (
  analysis_date  TEXT  NOT NULL,               -- YYYY-MM-DD (trading day)
  symbol         TEXT  NOT NULL,
  company_id     TEXT  NOT NULL,
  industry       TEXT  NOT NULL,
  sector         TEXT  NOT NULL,
  rs_1m          REAL,                         -- relative strength vs SPY 1M
  rs_3m          REAL,                         -- relative strength vs SPY 3M
  rs_6m          REAL,                         -- relative strength vs SPY 6M
  trend_score    REAL,                         -- 40% rs_1m + 35% rs_3m + 25% rs_6m
  data_quality   TEXT  DEFAULT 'ok',           -- 'ok' | 'partial' | 'insufficient_history' | 'stale'
  source_version TEXT  DEFAULT 'v1.0',
  PRIMARY KEY (analysis_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_mrd_date     ON market_rs_daily(analysis_date);
CREATE INDEX IF NOT EXISTS idx_mrd_industry ON market_rs_daily(industry, analysis_date);
CREATE INDEX IF NOT EXISTS idx_mrd_company  ON market_rs_daily(company_id, analysis_date);

-- ── 3. Daily Industry Aggregates ─────────────────────────────────────────
-- Pre-computed per industry — UI reads this, never scans market_rs_daily
-- Aggregation uses company-level dedup to avoid GOOG/GOOGL double vote

CREATE TABLE IF NOT EXISTS industry_trend_daily (
  analysis_date    TEXT  NOT NULL,             -- YYYY-MM-DD
  industry         TEXT  NOT NULL,
  sector           TEXT  NOT NULL,
  member_count     INTEGER NOT NULL DEFAULT 0, -- total constituents in master
  eligible_count   INTEGER NOT NULL DEFAULT 0, -- have all 3 RS horizons
  coverage_pct     REAL,                       -- eligible / member_count * 100
  median_rs_1m     REAL,
  median_rs_3m     REAL,
  median_rs_6m     REAL,
  trend_score      REAL,                       -- median weighted composite
  rotation_state   TEXT,                       -- 'Strengthening' | 'Weakening' | 'Reversing' | etc.
  universe_version TEXT  DEFAULT 'v1.0',
  PRIMARY KEY (analysis_date, industry)
);

CREATE INDEX IF NOT EXISTS idx_itd_date    ON industry_trend_daily(analysis_date);
CREATE INDEX IF NOT EXISTS idx_itd_sector  ON industry_trend_daily(sector, analysis_date);

-- ── 4. Market Map Run Log ─────────────────────────────────────────────────
-- Tracks each daily RS calculation run — separate from industry data
-- /api/market-map/latest reads from here to find last 'complete' snapshot
-- Never use __STATUS__ rows in industry_trend_daily

CREATE TABLE IF NOT EXISTS market_map_runs (
  analysis_date        TEXT    PRIMARY KEY,
  status               TEXT    NOT NULL CHECK(status IN ('complete','partial','failed')),
  symbols_expected     INTEGER NOT NULL DEFAULT 0,
  symbols_processed    INTEGER NOT NULL DEFAULT 0,
  symbols_insufficient INTEGER NOT NULL DEFAULT 0,
  coverage_pct         REAL,
  batches_total        INTEGER,
  batches_failed       INTEGER,
  started_at           TEXT,
  completed_at         TEXT,
  constituent_version  TEXT,
  error_summary        TEXT
);

CREATE INDEX IF NOT EXISTS idx_mmr_status ON market_map_runs(status, analysis_date DESC);
