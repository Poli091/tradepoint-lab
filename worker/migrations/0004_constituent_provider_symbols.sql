-- Migration 0004: Provider symbols, SEDOL, dual taxonomy
-- Run ONCE via: npx wrangler d1 execute tradepoint-db --file=worker/migrations/0004_constituent_provider_symbols.sql
-- Idempotency comes from migration tracking, not from SQL syntax.
-- To check if already applied: PRAGMA table_info(constituent_master);
-- Applied: 2026-07-13

-- Provider-specific symbol fields
-- 'symbol' remains the internal canonical primary key
ALTER TABLE constituent_master ADD COLUMN display_symbol   TEXT;
ALTER TABLE constituent_master ADD COLUMN source_symbol    TEXT;
ALTER TABLE constituent_master ADD COLUMN alpaca_symbol    TEXT;
ALTER TABLE constituent_master ADD COLUMN yahoo_symbol     TEXT;
ALTER TABLE constituent_master ADD COLUMN finnhub_symbol   TEXT;

-- Security identifiers
ALTER TABLE constituent_master ADD COLUMN sedol         TEXT;
ALTER TABLE constituent_master ADD COLUMN security_id   TEXT;

-- Dual taxonomy: GICS (external standard) vs TradePoint (custom analytical)
ALTER TABLE constituent_master ADD COLUMN gics_sector            TEXT;
ALTER TABLE constituent_master ADD COLUMN gics_industry          TEXT;
ALTER TABLE constituent_master ADD COLUMN tradepoint_sector      TEXT;
ALTER TABLE constituent_master ADD COLUMN tradepoint_industry    TEXT;

-- Classification provenance
ALTER TABLE constituent_master ADD COLUMN classification_source      TEXT DEFAULT 'manual';
ALTER TABLE constituent_master ADD COLUMN classification_confidence  TEXT DEFAULT 'high';
ALTER TABLE constituent_master ADD COLUMN needs_review               INTEGER NOT NULL DEFAULT 0;

-- Indices
-- SEDOL: partial index excludes NULL and empty string to allow rows without SEDOL
CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_sedol
  ON constituent_master(sedol)
  WHERE sedol IS NOT NULL AND sedol <> '';

CREATE INDEX IF NOT EXISTS idx_cm_needs_review
  ON constituent_master(needs_review)
  WHERE needs_review = 1;

CREATE INDEX IF NOT EXISTS idx_cm_tp_industry
  ON constituent_master(tradepoint_industry, active_to);
