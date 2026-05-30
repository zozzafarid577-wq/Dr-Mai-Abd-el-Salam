-- ================================================================
-- Dr Mai Portal — Migration v3
-- Run this in Supabase SQL Editor AFTER migration v2
-- ================================================================

-- ── 1. Remove EST Biology Basics ──────────────────────────────────
-- Cascade deletes modules, lessons, pdfs, tests, assignments, enrollments
DELETE FROM public.courses WHERE title = 'EST Biology Basics';

-- ── 2. Fix assignments column name (code uses due_at, schema had due_date) ──
ALTER TABLE public.assignments RENAME COLUMN due_date TO due_at;

-- ── 3. Add is_active to modules (hide individual lessons from students) ──
ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ── 4. Add description to modules ──────────────────────────────────
ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS description TEXT;

-- ── 5. module_pdfs table (PDFs attached at the lesson/topic level) ─
CREATE TABLE IF NOT EXISTS public.module_pdfs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  file_url   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.module_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_pdfs_for_auth" ON public.module_pdfs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins_all_module_pdfs" ON public.module_pdfs
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE INDEX IF NOT EXISTS idx_module_pdfs_module ON public.module_pdfs(module_id);

-- ── 6. Add module_id to practice_tests (ensure column exists) ─────
-- Already defined in supabase-setup.sql as nullable, but confirm
-- ALTER TABLE public.practice_tests ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES public.modules(id);
-- (Skipped — already present from setup SQL)

-- ── 7. Seed modules for the 3 remaining courses if missing ─────────
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
        INSERT INTO public.modules (course_id, title, order_index, is_active)
        VALUES (r.id, lesson_names[i], i, true);
      END LOOP;
      RAISE NOTICE 'Seeded 16 modules for course: %', r.title;
    ELSE
      RAISE NOTICE 'Skipped (already has modules): %', r.title;
    END IF;
  END LOOP;
END $$;
