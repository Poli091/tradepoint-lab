-- Migration v3: fix UNIQUE constraint + add person_cik column
-- Recreates insider_transactions with a correct schema.
-- Safe on existing data: copies rows then replaces the table.
-- Run once:
--   npx wrangler d1 execute tradepoint-db --remote --file=worker/schema_migration_insider_v3.sql

-- Step 1: new table with corrected schema
CREATE TABLE IF NOT EXISTS _ins_v3 (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker           TEXT    NOT NULL,
  cik              TEXT    NOT NULL,
  accession_no     TEXT    NOT NULL,
  filed_date       TEXT    NOT NULL,
  person_name      TEXT,
  person_cik       TEXT,           -- reporting owner CIK (<rptOwnerCik> in Form 4)
  person_title     TEXT,
  is_officer       INTEGER DEFAULT 0,
  is_director      INTEGER DEFAULT 0,
  transaction_date TEXT,
  transaction_code TEXT,
  shares           REAL,
  price_per_share  REAL,
  value_usd        REAL,
  shares_after     REAL,
  acquired_disposed TEXT,
  is_10b5_1        INTEGER DEFAULT 0,
  -- accession_no = one filing = one reporting owner.
  -- price_per_share distinguishes same-day/same-code rows with different prices.
  UNIQUE(accession_no, transaction_date, transaction_code, shares, price_per_share)
);

-- Step 2: copy existing data (person_cik NULL for legacy rows — fine, NULL ≠ NULL in SQLite)
INSERT OR IGNORE INTO _ins_v3
  (ticker, cik, accession_no, filed_date, person_name, person_title,
   is_officer, is_director, transaction_date, transaction_code,
   shares, price_per_share, value_usd, shares_after, acquired_disposed, is_10b5_1)
SELECT
  ticker, cik, accession_no, filed_date, person_name, person_title,
  is_officer, is_director, transaction_date, transaction_code,
  shares, price_per_share, value_usd, shares_after, acquired_disposed, is_10b5_1
FROM insider_transactions;

-- Step 3: drop old table (removes its implicit UNIQUE index too)
DROP TABLE IF EXISTS insider_transactions;

-- Step 4: rename into place
ALTER TABLE _ins_v3 RENAME TO insider_transactions;

-- Step 5: restore indexes
CREATE INDEX IF NOT EXISTS idx_ins_ticker      ON insider_transactions(ticker);
CREATE INDEX IF NOT EXISTS idx_ins_filed       ON insider_transactions(filed_date);
CREATE INDEX IF NOT EXISTS idx_ins_ticker_date ON insider_transactions(ticker, filed_date);
CREATE INDEX IF NOT EXISTS idx_ins_person_cik  ON insider_transactions(person_cik);
