-- Migration: Add Market Intelligence columns to snapshots
-- Run: npx wrangler d1 execute tradepoint-db --remote --command="ALTER TABLE snapshots ADD COLUMN market_vs_model TEXT;"
-- Run: npx wrangler d1 execute tradepoint-db --remote --command="ALTER TABLE snapshots ADD COLUMN market_sentiment TEXT;"
-- Run: npx wrangler d1 execute tradepoint-db --remote --command="ALTER TABLE snapshots ADD COLUMN narrative_summary TEXT;"
-- Run: npx wrangler d1 execute tradepoint-db --remote --command="ALTER TABLE snapshots ADD COLUMN mi_sources_used INTEGER;"
-- Run: npx wrangler d1 execute tradepoint-db --remote --command="ALTER TABLE snapshots ADD COLUMN mi_high_impact_pos INTEGER;"
-- Run: npx wrangler d1 execute tradepoint-db --remote --command="ALTER TABLE snapshots ADD COLUMN mi_high_impact_neg INTEGER;"

ALTER TABLE snapshots ADD COLUMN market_vs_model   TEXT;    -- Supports|Mostly Supports|Mixed|Contradicts
ALTER TABLE snapshots ADD COLUMN market_sentiment  TEXT;    -- Bullish|Mixed|Neutral|Bearish
ALTER TABLE snapshots ADD COLUMN narrative_summary TEXT;    -- 2-3 sentence summary
ALTER TABLE snapshots ADD COLUMN mi_sources_used   INTEGER; -- number of articles analyzed
ALTER TABLE snapshots ADD COLUMN mi_high_impact_pos INTEGER; -- count of high-impact positive headlines
ALTER TABLE snapshots ADD COLUMN mi_high_impact_neg INTEGER; -- count of high-impact negative headlines
