-- ============================================================
-- map_images: Multiple photos per map with primary selection
-- Run this in Supabase SQL Editor before deploying the feature.
-- ============================================================

CREATE TABLE IF NOT EXISTS map_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  image_url TEXT NOT NULL,
  storage_path TEXT,            -- path within map-images bucket (for cleanup on delete)
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fast lookup by map
CREATE INDEX IF NOT EXISTS idx_map_images_map_id ON map_images(map_id);

-- RLS: users can only manage their own images
ALTER TABLE map_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'map_images' AND policyname = 'Users manage own map images'
  ) THEN
    CREATE POLICY "Users manage own map images"
      ON map_images FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
