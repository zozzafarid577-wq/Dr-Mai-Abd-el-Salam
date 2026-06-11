-- ================================================================
-- Dr Mai Portal — Migration v14
-- Run in Supabase SQL Editor AFTER migration v13. Safe to re-run.
--
-- Content protection:
--   1. Scope lesson PDFs to enrolled students (they were world-readable
--      to any logged-in user, regardless of enrollment).
--   2. Add pluggable video-provider columns so lessons can move off
--      YouTube to a signed/domain-locked host without a code rewrite.
-- ================================================================

-- ── 1. Lock module_pdfs + lesson_pdfs to enrolled students ──────
-- module_pdfs: module -> course must be one the student is enrolled in.
DROP POLICY IF EXISTS "module_pdfs_for_auth" ON public.module_pdfs;
CREATE POLICY "module_pdfs_enrolled" ON public.module_pdfs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.modules m
      JOIN public.enrollments e
        ON e.course_id = m.course_id AND e.student_id = auth.uid()
      WHERE m.id = module_pdfs.module_id
    )
  );

-- lesson_pdfs: lesson -> module -> course must be enrolled.
DROP POLICY IF EXISTS "pdfs_for_auth" ON public.lesson_pdfs;
CREATE POLICY "lesson_pdfs_enrolled" ON public.lesson_pdfs
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.modules m     ON m.id = l.module_id
      JOIN public.enrollments e ON e.course_id = m.course_id AND e.student_id = auth.uid()
      WHERE l.id = lesson_pdfs.lesson_id
    )
  );
-- (admins keep full access via the existing "admins_all_*" policies)

-- ── 2. Pluggable video provider on lessons ──────────────────────
-- 'youtube' (default) keeps current behaviour. A future switch to a
-- signed host (e.g. 'bunny', 'cloudflare', 'vimeo') is then a data
-- change: set video_provider + video_id and the player adapts.
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS video_provider TEXT NOT NULL DEFAULT 'youtube';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS video_id       TEXT;

-- Backfill video_id from the existing youtube_id so nothing breaks.
UPDATE public.lessons
SET video_id = youtube_id
WHERE video_id IS NULL AND youtube_id IS NOT NULL;
