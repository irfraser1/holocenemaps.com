-- Collector acquisition and provenance events for physical map copies.
-- Additive and safe to re-run: no existing maps columns are removed or migrated.

CREATE TABLE IF NOT EXISTS map_acquisition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  event_date DATE,
  seller_name TEXT,
  price_amount NUMERIC,
  price_currency TEXT DEFAULT 'USD',
  listing_url TEXT,
  document_id UUID REFERENCES map_documents(id) ON DELETE SET NULL,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_acquisition_events_user_id
  ON map_acquisition_events(user_id);

CREATE INDEX IF NOT EXISTS idx_map_acquisition_events_map_id
  ON map_acquisition_events(map_id);

CREATE INDEX IF NOT EXISTS idx_map_acquisition_events_user_map_date
  ON map_acquisition_events(user_id, map_id, event_date DESC, created_at DESC);

ALTER TABLE map_acquisition_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own map acquisition events" ON map_acquisition_events;
CREATE POLICY "Users manage own map acquisition events"
  ON map_acquisition_events
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
    AND (
      document_id IS NULL
      OR EXISTS (
        SELECT 1 FROM map_documents
        WHERE map_documents.id = document_id
          AND map_documents.map_id = map_acquisition_events.map_id
          AND map_documents.user_id = auth.uid()
      )
    )
  );

CREATE TABLE IF NOT EXISTS map_provenance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  event_type TEXT,
  event_date_text TEXT,
  party_name TEXT,
  place TEXT,
  source_reference_id UUID REFERENCES map_references(id) ON DELETE SET NULL,
  source_document_id UUID REFERENCES map_documents(id) ON DELETE SET NULL,
  confidence TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_provenance_events_user_id
  ON map_provenance_events(user_id);

CREATE INDEX IF NOT EXISTS idx_map_provenance_events_map_id
  ON map_provenance_events(map_id);

CREATE INDEX IF NOT EXISTS idx_map_provenance_events_user_map_sort
  ON map_provenance_events(user_id, map_id, sort_order, created_at);

ALTER TABLE map_provenance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own map provenance events" ON map_provenance_events;
CREATE POLICY "Users manage own map provenance events"
  ON map_provenance_events
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
    AND (
      source_reference_id IS NULL
      OR EXISTS (
        SELECT 1 FROM map_references
        WHERE map_references.id = source_reference_id
          AND map_references.map_id = map_provenance_events.map_id
          AND map_references.user_id = auth.uid()
      )
    )
    AND (
      source_document_id IS NULL
      OR EXISTS (
        SELECT 1 FROM map_documents
        WHERE map_documents.id = source_document_id
          AND map_documents.map_id = map_provenance_events.map_id
          AND map_documents.user_id = auth.uid()
      )
    )
  );
