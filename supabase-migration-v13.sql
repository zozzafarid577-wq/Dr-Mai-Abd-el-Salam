-- ================================================================
-- Dr Mai Portal — Migration v13
-- Run this in Supabase SQL Editor AFTER migration v12
--
-- Adds:
--   1. Scheduled tests (open_at / close_at on practice_tests)
--   2. Flashcards: student read access to published bank questions
--      + per-student spaced-repetition progress table
--   3. Leaderboard: get_leaderboard() function (safe aggregate view
--      of other students' results without exposing raw attempts)
-- ================================================================

-- ── 1. Scheduled tests ──────────────────────────────────────────
ALTER TABLE public.practice_tests ADD COLUMN IF NOT EXISTS open_at  TIMESTAMPTZ;
ALTER TABLE public.practice_tests ADD COLUMN IF NOT EXISTS close_at TIMESTAMPTZ;

-- Enforce the open time at the database level: students cannot fetch
-- the questions of a scheduled test before it opens, even via the API.
DROP POLICY IF EXISTS "questions_for_auth" ON public.test_questions;
CREATE POLICY "questions_for_auth" ON public.test_questions
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.practice_tests t
      WHERE t.id = test_questions.test_id
        AND t.is_active = true
        AND (t.open_at IS NULL OR t.open_at <= NOW())
    )
  );
-- (admins keep full access through the existing "admins_all_questions" policy)

-- ── 2. Flashcards ───────────────────────────────────────────────
-- Students may read published bank questions for courses they are
-- enrolled in (or questions not linked to any course).
DROP POLICY IF EXISTS "qb_students_published" ON public.question_bank;
CREATE POLICY "qb_students_published" ON public.question_bank
  FOR SELECT TO authenticated USING (
    status = 'published'
    AND (
      course_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.student_id = auth.uid() AND e.course_id = question_bank.course_id
      )
    )
  );

-- Per-student Leitner-box progress for each flashcard.
CREATE TABLE IF NOT EXISTS public.flashcard_progress (
  student_id       UUID NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  question_id      UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  box              INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  due_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviews          INTEGER NOT NULL DEFAULT 0,
  correct          INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (student_id, question_id)
);

ALTER TABLE public.flashcard_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_flashcard_progress" ON public.flashcard_progress;
CREATE POLICY "own_flashcard_progress" ON public.flashcard_progress
  FOR ALL USING (auth.uid() = student_id);

CREATE INDEX IF NOT EXISTS idx_flashcards_due ON public.flashcard_progress(student_id, due_at);

-- ── 3. Leaderboard ──────────────────────────────────────────────
-- SECURITY DEFINER so students can see an aggregate ranking without
-- read access to other students' profiles or attempts.
-- window_days <= 0 means all-time.
CREATE OR REPLACE FUNCTION public.get_leaderboard(window_days INTEGER DEFAULT 7)
RETURNS TABLE (
  student_id   UUID,
  display_name TEXT,
  points       BIGINT,
  tests_taken  BIGINT,
  avg_pct      NUMERIC,
  streak_days  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH completed AS (
  SELECT ta.student_id, ta.percentage, ta.completed_at
  FROM test_attempts ta
  JOIN profiles p ON p.id = ta.student_id AND p.role = 'student' AND p.is_active
  WHERE ta.completed_at IS NOT NULL AND ta.percentage IS NOT NULL
),
windowed AS (
  SELECT student_id,
         COUNT(*)                       AS tests_taken,
         ROUND(AVG(percentage), 1)      AS avg_pct,
         SUM(ROUND(percentage))::BIGINT AS points
  FROM completed
  WHERE window_days <= 0 OR completed_at >= NOW() - (window_days || ' days')::interval
  GROUP BY student_id
),
activity AS (
  SELECT DISTINCT student_id, completed_at::date AS d FROM completed
),
ranked AS (
  SELECT student_id, d,
         ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY d DESC) AS rn
  FROM activity
),
streaks AS (
  -- length of the run of consecutive active days ending today or yesterday
  SELECT r.student_id, COUNT(*) AS streak_days
  FROM ranked r
  JOIN (SELECT student_id, MAX(d) AS last_d FROM activity GROUP BY student_id) m
    ON m.student_id = r.student_id
  WHERE m.last_d >= CURRENT_DATE - 1
    AND r.d = m.last_d - (r.rn - 1)::int
  GROUP BY r.student_id
)
SELECT w.student_id,
       TRIM(split_part(p.full_name, ' ', 1) || ' ' ||
            COALESCE(LEFT(split_part(p.full_name, ' ', 2), 1) || '.', '')) AS display_name,
       w.points, w.tests_taken, w.avg_pct,
       COALESCE(s.streak_days, 0) AS streak_days
FROM windowed w
JOIN profiles p ON p.id = w.student_id
LEFT JOIN streaks s ON s.student_id = w.student_id
ORDER BY w.points DESC, w.avg_pct DESC
LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(INTEGER) TO authenticated;
