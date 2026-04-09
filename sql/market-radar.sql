-- ============================================================
-- Market Radar Schema
-- Category-agnostic: works for maps, coins, stamps, cards, etc.
-- ============================================================

-- Raw pool of listings from any source
CREATE TABLE IF NOT EXISTS market_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'maps',        -- 'maps', 'coins', 'stamps', 'cards'
  title TEXT NOT NULL,
  description TEXT,
  dealer_name TEXT,
  dealer_url TEXT,
  image_url TEXT,
  price TEXT,
  source TEXT DEFAULT 'manual',                  -- 'ebay', 'auction_house', 'dealer', 'manual'
  listed_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',                   -- flexible: {cartographer, year, region} for maps; {mint, year, grade} for coins
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI-curated matches per user
CREATE TABLE IF NOT EXISTS market_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'maps',
  match_reason TEXT,
  confidence TEXT DEFAULT 'medium',              -- 'high', 'medium', 'low'
  status TEXT DEFAULT 'new',                     -- 'new', 'viewed', 'dismissed', 'saved'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, listing_id)                    -- one match per user per listing
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_listings_category ON market_listings(category);
CREATE INDEX IF NOT EXISTS idx_matches_user ON market_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_user_cat ON market_matches(user_id, category);

-- RLS: users can only read their own matches
ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_matches ENABLE ROW LEVEL SECURITY;

-- Anyone logged in can read listings
CREATE POLICY "Listings are readable by authenticated users"
  ON market_listings FOR SELECT
  TO authenticated
  USING (true);

-- Service role can insert/update listings (the scout script)
CREATE POLICY "Service role manages listings"
  ON market_listings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users see only their own matches
CREATE POLICY "Users read own matches"
  ON market_matches FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own match status (dismiss, save)
CREATE POLICY "Users update own matches"
  ON market_matches FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role manages all matches
CREATE POLICY "Service role manages matches"
  ON market_matches FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
