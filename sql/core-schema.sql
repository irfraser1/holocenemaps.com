-- Core Holocene Maps schema
-- Profiles and collection maps are the foundation of the logged-in app.
-- This file is intentionally idempotent: it can be re-run safely.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id),
  thesis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  cartographer TEXT,
  year TEXT,
  act INTEGER,
  status TEXT,
  priority INTEGER DEFAULT 3,
  dealer TEXT,
  price TEXT,
  url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  image_url TEXT,
  listing_url TEXT,
  source_url TEXT,
  source_domain TEXT,
  imported_at TIMESTAMPTZ,
  raw_import_snapshot JSONB DEFAULT '{}'::jsonb,
  extraction_confidence NUMERIC
);

ALTER TABLE maps ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS source_domain TEXT;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS raw_import_snapshot JSONB DEFAULT '{}'::jsonb;
ALTER TABLE maps ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC;

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_maps_user_id ON maps(user_id);
CREATE INDEX IF NOT EXISTS idx_maps_user_status ON maps(user_id, status);
CREATE INDEX IF NOT EXISTS idx_maps_user_priority ON maps(user_id, priority);
CREATE INDEX IF NOT EXISTS idx_maps_source_domain ON maps(user_id, source_domain);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;

-- Remove prototype-era policies before installing the canonical rules.
DROP POLICY IF EXISTS "Allow insert for known user" ON maps;
DROP POLICY IF EXISTS "Users manage own maps" ON maps;
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users manage own maps"
  ON maps
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own profile"
  ON profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
