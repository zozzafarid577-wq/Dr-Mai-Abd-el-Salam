-- ================================================================
-- Dr Mai Portal — Migration v16
-- Run this in Supabase SQL Editor AFTER migration v15
--
-- Adds:
--   1. practice_tests.pdf_url / pdf_name — attach a PDF version of the
--      test (answer key / printable copy) shown to the student at the
--      end of the test.
--   2. A public "test-pdfs" storage bucket so admins can upload the PDF
--      directly (instead of only pasting an external link).
--
-- Note: practice_tests.module_id already exists from the original
-- schema — it is what links a test to a lesson (module). No change
-- needed there; this migration only adds the PDF attachment.
-- ================================================================

-- ── 1. PDF attachment on practice tests ─────────────────────────
ALTER TABLE public.practice_tests ADD COLUMN IF NOT EXISTS pdf_url  TEXT;
ALTER TABLE public.practice_tests ADD COLUMN IF NOT EXISTS pdf_name TEXT;

-- ── 2. Test PDFs bucket ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('test-pdfs', 'test-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone authenticated may view a test PDF (students download it after the test).
DROP POLICY IF EXISTS "testpdf_public_read" ON storage.objects;
CREATE POLICY "testpdf_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'test-pdfs');

-- Only admins may upload, replace, or delete them.
DROP POLICY IF EXISTS "testpdf_admin_insert" ON storage.objects;
CREATE POLICY "testpdf_admin_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'test-pdfs'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "testpdf_admin_update" ON storage.objects;
CREATE POLICY "testpdf_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'test-pdfs'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "testpdf_admin_delete" ON storage.objects;
CREATE POLICY "testpdf_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'test-pdfs'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
