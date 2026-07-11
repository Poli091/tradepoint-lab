-- Migration: add comparability metadata to snapshots
-- All columns nullable — existing rows treated as "legacy, limited comparability"
-- Run once: npx wrangler d1 execute tradepoint-db --remote --file=worker/schema_migration_metadata.sql

ALTER TABLE snapshots ADD COLUMN fundamentals_as_of TEXT;  -- date of most recent balance sheet used
ALTER TABLE snapshots ADD COLUMN market_data_as_of  TEXT;  -- timestamp of price/OHLCV data
ALTER TABLE snapshots ADD COLUMN calculated_at      TEXT;  -- when TradePoint ran the analysis
ALTER TABLE snapshots ADD COLUMN model_version      TEXT;  -- e.g. "conviction-v1.0"

-- For Groq outputs stored in snapshots
ALTER TABLE snapshots ADD COLUMN prompt_version     TEXT;  -- e.g. "mi-v1.2", "pr-v1.0"
ALTER TABLE snapshots ADD COLUMN llm_model          TEXT;  -- e.g. "llama-3.3-70b"
ALTER TABLE snapshots ADD COLUMN fallback_used      INTEGER DEFAULT 0;  -- 1 if Groq JSON was invalid
