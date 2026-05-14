-- Edge Function usage accounting and daily-limit support.
-- Run this before deploying the authenticated/rate-limited Edge Functions.

CREATE TABLE IF NOT EXISTS edge_function_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_key TEXT,
  status TEXT NOT NULL DEFAULT 'allowed' CHECK (status IN ('allowed', 'blocked')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR anon_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS edge_function_usage_user_idx
  ON edge_function_usage (function_name, user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS edge_function_usage_anon_idx
  ON edge_function_usage (function_name, anon_key, created_at DESC)
  WHERE anon_key IS NOT NULL;

ALTER TABLE edge_function_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see own edge usage" ON edge_function_usage;
CREATE POLICY "Users can see own edge usage"
  ON edge_function_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Inserts are performed by Edge Functions using the service role key.
-- Do not add public INSERT/UPDATE/DELETE policies for this table.
