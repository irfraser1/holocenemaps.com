-- Fix map-images storage ownership policies.
--
-- Problem being fixed:
-- The previous update/delete policies only checked bucket_id = 'map-images',
-- so any authenticated user could update or delete any file in that bucket.
--
-- New rule:
-- Users may update/delete files in their own top-level folder:
--   map-images/{auth.uid()}/...
-- Legacy files remain manageable only when public.map_images.storage_path
-- links the file to the current user.

DROP POLICY IF EXISTS "Allow anonymous scan uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload map images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for map images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own map images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own map images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

CREATE POLICY "Allow anonymous scan uploads"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'map-images'
  AND (storage.foldername(name))[1] = 'scans'
);

CREATE POLICY "Authenticated users can upload map images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'map-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = 'scans'
  )
);

CREATE POLICY "Public read access for map images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'map-images');

CREATE POLICY "Users can update their own map images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'map-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.map_images
      WHERE map_images.storage_path = name
        AND map_images.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'map-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.map_images
      WHERE map_images.storage_path = name
        AND map_images.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete their own map images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'map-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.map_images
      WHERE map_images.storage_path = name
        AND map_images.user_id = auth.uid()
    )
  )
);
