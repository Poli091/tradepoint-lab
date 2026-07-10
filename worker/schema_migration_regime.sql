-- Migration: Add market_regime to snapshots
-- Run each line separately:
-- npx wrangler d1 execute tradepoint-db --remote --command="ALTER TABLE snapshots ADD COLUMN market_regime TEXT;"

ALTER TABLE snapshots ADD COLUMN market_regime TEXT; -- 'bullish'|'neutral'|'bearish'
