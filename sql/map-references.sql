-- Structured bibliographic/reference support for map catalogue records.
-- Additive and safe to re-run: existing catalogue reference fields are preserved.

CREATE TABLE IF NOT EXISTS map_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  citation TEXT NOT NULL,
  reference_type TEXT,
  author TEXT,
  title TEXT,
  publisher TEXT,
  year TEXT,
  page_or_entry TEXT,
  url TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_references_user_id
  ON map_references(user_id);

CREATE INDEX IF NOT EXISTS idx_map_references_map_id
  ON map_references(map_id);

CREATE INDEX IF NOT EXISTS idx_map_references_user_map_sort
  ON map_references(user_id, map_id, sort_order, created_at);

ALTER TABLE map_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own map references" ON map_references;
CREATE POLICY "Users manage own map references"
  ON map_references
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM maps
      WHERE maps.id = map_id
        AND maps.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM maps
      WHERE maps.id = map_id
        AND maps.user_id = auth.uid()
    )
  );
