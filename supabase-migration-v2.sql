-- ================================================================
-- Dr Mai Portal — Migration v2
-- Run this in Supabase SQL Editor AFTER the original supabase-setup.sql
-- ================================================================

-- ── 1. Schema fixes ──────────────────────────────────────────────

-- lessons: add youtube_id (used by portal/lessons.html)
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS youtube_id TEXT;

-- test_questions: add correct_index (was missing from original schema)
ALTER TABLE public.test_questions ADD COLUMN IF NOT EXISTS correct_index INTEGER NOT NULL DEFAULT 0;

-- practice_tests: add is_mock flag to distinguish full mock exams
ALTER TABLE public.practice_tests ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Clean up & seed the 4 official courses ───────────────────

-- Remove duplicate courses (keep oldest of each name)
DELETE FROM public.courses a
USING public.courses b
WHERE a.title = b.title AND a.created_at > b.created_at;

-- Remove any courses that are NOT one of the 4 official ones
DELETE FROM public.courses WHERE title NOT IN (
  'ACT Biology Basics',
  'ACT Biology Revision',
  'EST Biology Basics',
  'EST Biology Revision'
);

-- Insert the 4 official courses if they don't exist yet
INSERT INTO public.courses (title, subject, is_active)
SELECT v.title, v.subject, true
FROM (VALUES
  ('ACT Biology Basics',   'ACT'),
  ('ACT Biology Revision', 'ACT'),
  ('EST Biology Basics',   'EST'),
  ('EST Biology Revision', 'EST')
) AS v(title, subject)
WHERE NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.title = v.title);

-- ── 4. Seed 16 lesson modules per course ────────────────────────
-- Only seeds if the course has zero modules (safe to re-run)

DO $$
DECLARE
  lesson_names TEXT[] := ARRAY[
    'Animal Behavior',
    'Evolution',
    'Ecology',
    'Cell Division',
    'DNA Replication & Protein Synthesis',
    'Classical Genetics',
    'Molecular Genetics',
    'Cell Structure & Transport',
    'Biochemistry & Enzymes',
    'Photosynthesis / Cellular Respiration',
    'Circulatory / Respiratory Systems',
    'Digestive / Immune / Skeletal Systems',
    'Endocrine / Nervous Systems',
    'Reproductive / Excretory Systems',
    'Plants',
    'Taxonomy'
  ];
  r public.courses%ROWTYPE;
BEGIN
  FOR r IN SELECT * FROM public.courses ORDER BY title LOOP
    IF NOT EXISTS (SELECT 1 FROM public.modules WHERE course_id = r.id) THEN
      FOR i IN 1..16 LOOP
        INSERT INTO public.modules (course_id, title, order_index)
        VALUES (r.id, lesson_names[i], i);
      END LOOP;
      RAISE NOTICE 'Seeded 16 modules for course: %', r.title;
    ELSE
      RAISE NOTICE 'Skipped (already has modules): %', r.title;
    END IF;
  END LOOP;
END $$;
