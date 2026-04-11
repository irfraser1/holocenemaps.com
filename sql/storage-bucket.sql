-- Create the map-images storage bucket with public read access
INSERT INTO storage.buckets (id, name, public)
VALUES ('map-images', 'map-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload map images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'map-images');

-- Allow public read access to all map images
CREATE POLICY "Public read access for map images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'map-images');

-- Allow users to update their own images
CREATE POLICY "Users can update their own map images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'map-images');

-- Allow users to delete their own images  
CREATE POLICY "Users can delete their own map images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'map-images');
