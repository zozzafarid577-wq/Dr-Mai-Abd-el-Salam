-- ================================================================
-- Dr Mai Portal — Migration v17
-- Run this in Supabase SQL Editor AFTER migration v16
--
-- Adds:
--   practice_tests.module_ids — a list of lessons (modules) a test
--   belongs to, so one practice test can cover 2–3 lessons and show
--   up under each of them for students.
--
-- The original single-lesson column practice_tests.module_id is kept
-- (it mirrors the FIRST lesson in module_ids) for backwards
-- compatibility with anything still reading it.
-- ================================================================

ALTER TABLE public.practice_tests
  ADD COLUMN IF NOT EXISTS module_ids UUID[] NOT NULL DEFAULT '{}';

-- Backfill: seed the array from the existing single lesson link.
UPDATE public.practice_tests
   SET module_ids = ARRAY[module_id]
 WHERE module_id IS NOT NULL
   AND (module_ids IS NULL OR array_length(module_ids, 1) IS NULL);

-- Helps the student queries that look up tests "for this lesson".
CREATE INDEX IF NOT EXISTS idx_practice_tests_module_ids
  ON public.practice_tests USING GIN (module_ids);
