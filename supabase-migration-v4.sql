-- ================================================================
-- Dr Mai Portal — Migration v4
-- Run this in Supabase SQL Editor AFTER migration v3
--
-- Gives the Revision courses their own module structure:
--   • ACT Biology Revision  → 8 modules (Test 1 … Test 8)
--   • EST Biology Revision  → 9 tests (Test 1 … Test 9) + 3 Sample Tests
--
-- WARNING: This DELETES and RE-CREATES the modules for the two
-- Revision courses, so any content already added to those courses'
-- lessons will be removed. The 16-lesson "ACT Biology Basics" course
-- is NOT touched.
-- ================================================================

-- ── ACT Biology Revision → 8 test modules ────────────────────────
DO $$
DECLARE
  cid UUID;
BEGIN
  SELECT id INTO cid FROM public.courses WHERE title = 'ACT Biology Revision' LIMIT 1;
  IF cid IS NOT NULL THEN
    DELETE FROM public.modules WHERE course_id = cid;
    FOR i IN 1..8 LOOP
      INSERT INTO public.modules (course_id, title, order_index, is_active)
      VALUES (cid, 'Test ' || i, i, true);
    END LOOP;
    RAISE NOTICE 'ACT Biology Revision: seeded 8 test modules';
  END IF;
END $$;

-- ── EST Biology Revision → 9 test modules + 3 sample tests ───────
DO $$
DECLARE
  cid UUID;
BEGIN
  SELECT id INTO cid FROM public.courses WHERE title = 'EST Biology Revision' LIMIT 1;
  IF cid IS NOT NULL THEN
    DELETE FROM public.modules WHERE course_id = cid;
    FOR i IN 1..9 LOOP
      INSERT INTO public.modules (course_id, title, order_index, is_active)
      VALUES (cid, 'Test ' || i, i, true);
    END LOOP;
    FOR i IN 1..3 LOOP
      INSERT INTO public.modules (course_id, title, order_index, is_active)
      VALUES (cid, 'Sample Test ' || i, 9 + i, true);
    END LOOP;
    RAISE NOTICE 'EST Biology Revision: seeded 9 test modules + 3 sample tests';
  END IF;
END $$;
