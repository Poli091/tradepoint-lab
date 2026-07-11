-- Migration v2: add more robust unique index for insider_transactions
-- The original UNIQUE(accession_no, transaction_code, transaction_date, shares)
-- can miss edge cases where person_name differs.
-- This index is additive and safe to run on existing data.
-- Run once:
--   npx wrangler d1 execute tradepoint-db --remote --file=worker/schema_migration_insider_v2.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_ins_unique_v2
ON insider_transactions(accession_no, person_name, transaction_date, transaction_code, shares, price_per_share);
