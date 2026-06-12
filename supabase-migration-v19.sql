-- ================================================================
-- Dr Mai Portal — Migration v19
-- Run this in Supabase SQL Editor AFTER migration v18
--
-- Adds a public "lesson-media" storage bucket so admins can UPLOAD
-- recordings (video files) and lesson PDFs directly, instead of
-- relying on Google Drive / external links (which often fail with
-- "you don't have access" even when link-sharing is on).
--
-- Note on size: the Supabase JS client uploads files up to your
-- project's storage file-size limit (Project Settings → Storage →
-- "Upload file size limit"; default 50 MB). Raise it there if you
-- need to upload longer recordings. For very large videos, YouTube
-- is still the most reliable option.
-- ================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-media', 'lesson-media', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone may view/stream lesson media (students watch recordings & open PDFs).
DROP POLICY IF EXISTS "lessonmedia_public_read" ON storage.objects;
CREATE POLICY "lessonmedia_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'lesson-media');

-- Only admins may upload, replace, or delete.
DROP POLICY IF EXISTS "lessonmedia_admin_insert" ON storage.objects;
CREATE POLICY "lessonmedia_admin_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'lesson-media'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "lessonmedia_admin_update" ON storage.objects;
CREATE POLICY "lessonmedia_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'lesson-media'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "lessonmedia_admin_delete" ON storage.objects;
CREATE POLICY "lessonmedia_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'lesson-media'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
