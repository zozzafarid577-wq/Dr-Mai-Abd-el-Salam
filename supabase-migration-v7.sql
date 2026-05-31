-- ================================================================
-- Dr Mai Portal — Migration v7
-- Run this in Supabase SQL Editor AFTER migration v6
-- ================================================================

-- ── Question Bank table ─────────────────────────────────────────
-- Standalone question library, independent of any specific test.
-- question_type: mcq | terms | true_false | fill_blank
-- difficulty:    easy | medium | hard
-- options:       TEXT array (MCQ/terms: A,B,C,D; true_false: [True,False])
-- correct_index: 0-based index into options (MCQ, terms, true_false)
-- correct_answer: text answer (fill_blank; also mirrors options[correct_index])
-- status:        draft | published

CREATE TABLE IF NOT EXISTS public.question_bank (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID         REFERENCES public.courses(id)  ON DELETE SET NULL,
  module_id      UUID         REFERENCES public.modules(id)  ON DELETE SET NULL,
  question_type  TEXT         NOT NULL DEFAULT 'mcq',
  difficulty     TEXT         NOT NULL DEFAULT 'medium',
  question_text  TEXT         NOT NULL,
  options        TEXT[],
  correct_index  INTEGER,
  correct_answer TEXT,
  explanation    TEXT,
  image_url      TEXT,
  tags           TEXT[],
  status         TEXT         NOT NULL DEFAULT 'published',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

-- Admins can do everything (JWT app_metadata check)
CREATE POLICY "qb_admin_jwt" ON public.question_bank
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Fallback: admins via profiles table (catches admins without JWT metadata refresh)
CREATE POLICY "qb_admin_profile" ON public.question_bank
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_qb_course   ON public.question_bank(course_id);
CREATE INDEX IF NOT EXISTS idx_qb_module   ON public.question_bank(module_id);
CREATE INDEX IF NOT EXISTS idx_qb_type     ON public.question_bank(question_type);
CREATE INDEX IF NOT EXISTS idx_qb_diff     ON public.question_bank(difficulty);
CREATE INDEX IF NOT EXISTS idx_qb_status   ON public.question_bank(status);
