-- ================================================================
-- Dr Mai Portal — Migration v18
-- Run this in Supabase SQL Editor AFTER migration v17
--
-- Adds:
--   student_notes — a private, free-text notes pad for each student
--   (used by the new "My Scores & Notes" page). One row per student.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.student_notes (
  student_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

-- A student can only read/write their own notes.
DROP POLICY IF EXISTS "own_notes" ON public.student_notes;
CREATE POLICY "own_notes" ON public.student_notes
  FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- Admins may read everything (e.g. for support).
DROP POLICY IF EXISTS "admins_read_notes" ON public.student_notes;
CREATE POLICY "admins_read_notes" ON public.student_notes
  FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
