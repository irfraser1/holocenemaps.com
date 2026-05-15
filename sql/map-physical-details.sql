-- Institution-grade physical cataloguing details for maps.
-- Run in Supabase SQL Editor before deploying the Physical tab UI.
-- Additive and safe to re-run: no existing columns are removed or migrated.

CREATE TABLE IF NOT EXISTS map_physical_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL UNIQUE REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  sheet_width NUMERIC,
  sheet_height NUMERIC,
  image_width NUMERIC,
  image_height NUMERIC,
  plate_width NUMERIC,
  plate_height NUMERIC,
  dimension_unit TEXT,

  medium TEXT,
  materials TEXT,
  coloring TEXT,
  coloring_notes TEXT,

  condition_grade TEXT,
  condition_summary TEXT,
  condition_details TEXT,
  margins TEXT,
  backing_lining TEXT,
  restoration_notes TEXT,

  framing_status TEXT,
  inspected_at DATE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_physical_details_user_id
  ON map_physical_details(user_id);

CREATE INDEX IF NOT EXISTS idx_map_physical_details_map_id
  ON map_physical_details(map_id);

ALTER TABLE map_physical_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own map physical details" ON map_physical_details;
CREATE POLICY "Users manage own map physical details"
  ON map_physical_details
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
