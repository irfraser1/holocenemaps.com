-- Phase 1 collector-grade map detail foundation.
-- Additive and safe to re-run: no existing maps columns are removed or renamed.

CREATE TABLE IF NOT EXISTS map_catalog_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL UNIQUE REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  display_title TEXT,
  full_title_transcription TEXT,
  alternate_titles JSONB DEFAULT '[]'::jsonb,

  region TEXT,
  subject_tags JSONB DEFAULT '[]'::jsonb,
  map_type TEXT,
  language TEXT,

  publisher TEXT,
  engraver TEXT,
  place_of_publication TEXT,
  publication_source TEXT,
  edition TEXT,
  state TEXT,
  plate_number TEXT,

  reference_entries JSONB DEFAULT '[]'::jsonb,
  bibliography_notes TEXT,

  summary TEXT,
  physical_summary TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_catalog_details_user_id
  ON map_catalog_details(user_id);

CREATE INDEX IF NOT EXISTS idx_map_catalog_details_map_id
  ON map_catalog_details(map_id);

CREATE INDEX IF NOT EXISTS idx_map_catalog_details_region
  ON map_catalog_details(region);

ALTER TABLE map_catalog_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own map catalog details" ON map_catalog_details;
CREATE POLICY "Users manage own map catalog details"
  ON map_catalog_details
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

CREATE TABLE IF NOT EXISTS map_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL UNIQUE REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  user_notes TEXT,
  ai_summary TEXT,
  ai_thesis_fit TEXT,
  ai_recommendation TEXT,
  ai_confidence TEXT,
  ai_uncertainties JSONB DEFAULT '[]'::jsonb,
  ai_sources JSONB DEFAULT '[]'::jsonb,
  last_ai_evaluated_at TIMESTAMPTZ,
  last_ai_model TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_notes_user_id
  ON map_notes(user_id);

CREATE INDEX IF NOT EXISTS idx_map_notes_map_id
  ON map_notes(map_id);

ALTER TABLE map_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own map notes" ON map_notes;
CREATE POLICY "Users manage own map notes"
  ON map_notes
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

-- Preserve maps.notes as a legacy fallback. Copy it once into user_notes
-- only for maps that do not already have a dedicated map_notes row.
INSERT INTO map_notes (map_id, user_id, user_notes)
SELECT id, user_id, notes
FROM maps
WHERE notes IS NOT NULL AND btrim(notes) <> ''
ON CONFLICT (map_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS map_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL DEFAULT 'other',
  title TEXT,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_documents_user_id
  ON map_documents(user_id);

CREATE INDEX IF NOT EXISTS idx_map_documents_map_id
  ON map_documents(map_id);

CREATE INDEX IF NOT EXISTS idx_map_documents_type
  ON map_documents(document_type);

ALTER TABLE map_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own map documents" ON map_documents;
CREATE POLICY "Users manage own map documents"
  ON map_documents
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

-- Private bucket for invoices, COAs, condition reports, and provenance files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('map-documents', 'map-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users upload own map documents" ON storage.objects;
DROP POLICY IF EXISTS "Users read own map documents" ON storage.objects;
DROP POLICY IF EXISTS "Users update own map documents" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own map documents" ON storage.objects;

CREATE POLICY "Users upload own map documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'map-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users read own map documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'map-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users update own map documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'map-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'map-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own map documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'map-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
