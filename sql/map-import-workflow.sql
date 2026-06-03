-- Reusable URL import workflow metadata for dealer listings.
-- Additive and safe to re-run: no existing map data is removed or migrated.

ALTER TABLE maps ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS source_domain TEXT;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS source_listing_title TEXT;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS raw_import_snapshot JSONB DEFAULT '{}'::jsonb;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC;

CREATE INDEX IF NOT EXISTS idx_maps_source_domain
  ON maps(user_id, source_domain);
