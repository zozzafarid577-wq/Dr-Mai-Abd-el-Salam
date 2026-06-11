-- ================================================================
-- Dr Mai Portal — Migration v15
-- Run this in Supabase SQL Editor AFTER migration v14
--
-- Adds:
--   1. test_questions.correct_answer — lets Fill-in-Blank questions be
--      added directly to a practice test (not just the question bank).
--   2. A public "question-images" storage bucket so admins can upload
--      images for questions (file picker / drag-drop / paste) instead
--      of pasting external URLs.
-- ================================================================

-- ── 1. Fill-in-blank answers on test questions ──────────────────
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS correct_answer TEXT;

-- ── 2. Question images bucket ───────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone may view question images (students see them inside tests).
DROP POLICY IF EXISTS "qimg_public_read" ON storage.objects;
CREATE POLICY "qimg_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'question-images');

-- Only admins may upload, replace, or delete them.
DROP POLICY IF EXISTS "qimg_admin_insert" ON storage.objects;
CREATE POLICY "qimg_admin_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'question-images'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "qimg_admin_update" ON storage.objects;
CREATE POLICY "qimg_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'question-images'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "qimg_admin_delete" ON storage.objects;
CREATE POLICY "qimg_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'question-images'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
