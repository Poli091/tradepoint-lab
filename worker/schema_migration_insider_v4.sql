-- Migration v4: final correct schema for insider_transactions
-- Adds transaction_table + transaction_index → true unique key per SEC row.
-- Safe from ANY previous state (v1, v2, v3).
-- Run once:
--   npx wrangler d1 execute tradepoint-db --remote --file=worker/schema_migration_insider_v4.sql

-- Step 1: New table — no inline UNIQUE (handled by expression index below)
CREATE TABLE IF NOT EXISTS _ins_v4 (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker            TEXT    NOT NULL,
  cik               TEXT    NOT NULL,
  accession_no      TEXT    NOT NULL,
  filed_date        TEXT    NOT NULL,
  person_name       TEXT,
  person_cik        TEXT,                       -- <rptOwnerCik> from Form 4 XML
  person_title      TEXT,
  is_officer        INTEGER DEFAULT 0,
  is_director       INTEGER DEFAULT 0,
  transaction_date  TEXT,
  transaction_code  TEXT,
  transaction_table TEXT    DEFAULT 'non_derivative', -- 'non_derivative' | 'derivative'
  transaction_index INTEGER,                    -- 0-based position within its table in the XML
  shares            REAL,
  price_per_share   REAL,
  value_usd         REAL,
  shares_after      REAL,
  acquired_disposed TEXT,
  is_10b5_1         INTEGER DEFAULT 0
);

-- Step 2: Copy existing data.
-- Does NOT select person_cik — may not exist in older schemas.
-- Assigns sequential transaction_index per filing via window function.
INSERT INTO _ins_v4
  (ticker, cik, accession_no, filed_date, person_name,
   person_title, is_officer, is_director, transaction_date, transaction_code,
   transaction_table, transaction_index,
   shares, price_per_share, value_usd, shares_after, acquired_disposed, is_10b5_1)
SELECT
  ticker, cik, accession_no, filed_date, person_name,
  person_title, is_officer, is_director, transaction_date, transaction_code,
  'non_derivative',
  ROW_NUMBER() OVER (PARTITION BY accession_no ORDER BY id) - 1,
  shares, price_per_share, value_usd, shares_after, acquired_disposed, is_10b5_1
FROM insider_transactions;

-- Step 3: Drop old table (removes all old UNIQUE constraints and indexes)
DROP TABLE IF EXISTS insider_transactions;

-- Step 4: Rename into place
ALTER TABLE _ins_v4 RENAME TO insider_transactions;

-- Step 5: Robust UNIQUE expression index
-- COALESCE(person_cik, person_name, '') handles NULL person_cik (uses name fallback)
-- COALESCE(transaction_index, -1) handles any unexpected NULL index (shouldn't occur)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ins_unique_v4
ON insider_transactions (
  accession_no,
  COALESCE(person_cik, person_name, ''),
  COALESCE(transaction_table, 'non_derivative'),
  COALESCE(transaction_index, -1)
);

-- Step 6: Access indexes
CREATE INDEX IF NOT EXISTS idx_ins_ticker      ON insider_transactions(ticker);
CREATE INDEX IF NOT EXISTS idx_ins_filed       ON insider_transactions(filed_date);
CREATE INDEX IF NOT EXISTS idx_ins_ticker_date ON insider_transactions(ticker, filed_date);
CREATE INDEX IF NOT EXISTS idx_ins_person_cik  ON insider_transactions(person_cik);
