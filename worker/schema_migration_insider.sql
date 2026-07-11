-- Migration: insider transactions from SEC EDGAR Form 4
-- Historical filings are permanent — store in D1, never re-fetch.
-- Run once:
--   npx wrangler d1 execute tradepoint-db --remote --file=worker/schema_migration_insider.sql

CREATE TABLE IF NOT EXISTS insider_transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker           TEXT    NOT NULL,
  cik              TEXT    NOT NULL,
  accession_no     TEXT    NOT NULL,
  filed_date       TEXT    NOT NULL,      -- YYYY-MM-DD
  person_name      TEXT,
  person_title     TEXT,
  is_officer       INTEGER DEFAULT 0,
  is_director      INTEGER DEFAULT 0,
  transaction_date TEXT,                  -- YYYY-MM-DD
  transaction_code TEXT,                  -- P, S, F, M, G, D, etc.
  shares           REAL,
  price_per_share  REAL,
  value_usd        REAL,
  shares_after     REAL,
  acquired_disposed TEXT,                 -- A or D
  is_10b5_1        INTEGER DEFAULT 0,     -- 1 if under 10b5-1 plan
  UNIQUE(accession_no, transaction_code, transaction_date, shares)
);

CREATE INDEX IF NOT EXISTS idx_ins_ticker      ON insider_transactions(ticker);
CREATE INDEX IF NOT EXISTS idx_ins_filed       ON insider_transactions(filed_date);
CREATE INDEX IF NOT EXISTS idx_ins_ticker_date ON insider_transactions(ticker, filed_date);
