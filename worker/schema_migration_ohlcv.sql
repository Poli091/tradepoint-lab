-- Migration: persistent OHLCV bars for long-range chart data (2Y / 5Y / ALL)
-- Historical bars never change once finalized — store permanently in D1.
-- Run once:
--   npx wrangler d1 execute tradepoint-db --remote --file=worker/schema_migration_ohlcv.sql

CREATE TABLE IF NOT EXISTS ohlcv_bars (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker   TEXT NOT NULL,
  bar_date TEXT NOT NULL,   -- YYYY-MM-DD (period end date)
  res      TEXT NOT NULL,   -- 'W' = weekly, 'M' = monthly
  open     REAL,
  high     REAL,
  low      REAL,
  close    REAL NOT NULL,
  volume   INTEGER,
  UNIQUE(ticker, bar_date, res)  -- prevents duplicate inserts
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_ticker_res  ON ohlcv_bars(ticker, res);
CREATE INDEX IF NOT EXISTS idx_ohlcv_bar_date    ON ohlcv_bars(bar_date);
