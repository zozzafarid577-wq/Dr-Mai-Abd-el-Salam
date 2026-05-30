-- ================================================================
-- Dr Mai Abd El Salam — Supabase Database Setup
-- Run this entire file in your Supabase SQL Editor
-- ================================================================

-- ────────────────────────────────────────
-- PROFILES (extends auth.users)
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'student')),
  full_name      TEXT NOT NULL,
  phone          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  must_change_pw BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "own_profile_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ────────────────────────────────────────
-- COURSES
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  subject       TEXT,
  description   TEXT,
  thumbnail_url TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active_courses_for_auth" ON public.courses
  FOR SELECT TO authenticated USING (is_active = true);

-- ────────────────────────────────────────
-- MODULES (chapters inside a course)
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modules_for_auth" ON public.modules
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────
-- LESSONS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lessons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  video_url    TEXT,
  duration_min INTEGER,
  order_index  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lessons_for_auth" ON public.lessons
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────
-- LESSON PDFs
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lesson_pdfs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  file_url   TEXT NOT NULL,
  file_size  BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lesson_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdfs_for_auth" ON public.lesson_pdfs
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────
-- ENROLLMENTS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.enrollments (
  student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  PRIMARY KEY (student_id, course_id)
);

ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_enrollments" ON public.enrollments
  FOR SELECT USING (auth.uid() = student_id);

-- ────────────────────────────────────────
-- LESSON COMPLETIONS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lesson_completions (
  student_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id    UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, lesson_id)
);

ALTER TABLE public.lesson_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_completions" ON public.lesson_completions
  FOR ALL USING (auth.uid() = student_id);

-- ────────────────────────────────────────
-- PRACTICE TESTS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.practice_tests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id         UUID REFERENCES public.modules(id),
  title             TEXT NOT NULL,
  description       TEXT,
  time_limit_min    INTEGER,
  passing_score_pct INTEGER NOT NULL DEFAULT 70,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.practice_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active_tests_for_auth" ON public.practice_tests
  FOR SELECT TO authenticated USING (is_active = true);

-- ────────────────────────────────────────
-- TEST QUESTIONS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.test_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id       UUID NOT NULL REFERENCES public.practice_tests(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options       JSONB NOT NULL,
  explanation   TEXT,
  order_index   INTEGER NOT NULL DEFAULT 0,
  points        INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.test_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_for_auth" ON public.test_questions
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────
-- TEST ATTEMPTS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  test_id        UUID NOT NULL REFERENCES public.practice_tests(id) ON DELETE CASCADE,
  answers        JSONB,
  score          INTEGER,
  max_score      INTEGER,
  percentage     DECIMAL(5,2),
  passed         BOOLEAN,
  time_taken_sec INTEGER,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_attempts" ON public.test_attempts
  FOR ALL USING (auth.uid() = student_id);

-- ────────────────────────────────────────
-- ASSIGNMENTS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id   UUID REFERENCES public.modules(id),
  title       TEXT NOT NULL,
  description TEXT,
  file_url    TEXT,
  due_date    TIMESTAMPTZ,
  max_score   INTEGER NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active_assignments_for_auth" ON public.assignments
  FOR SELECT TO authenticated USING (is_active = true);

-- ────────────────────────────────────────
-- ASSIGNMENT SUBMISSIONS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_url      TEXT,
  text_answer   TEXT,
  score         INTEGER,
  feedback      TEXT,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graded_at     TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_submissions" ON public.assignment_submissions
  FOR ALL USING (auth.uid() = student_id);

-- ────────────────────────────────────────
-- ANNOUNCEMENTS
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.profiles(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  target     TEXT NOT NULL DEFAULT 'all',
  course_id  UUID REFERENCES public.courses(id),
  priority   TEXT NOT NULL DEFAULT 'normal',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active_announcements_for_auth" ON public.announcements
  FOR SELECT TO authenticated USING (is_active = true);

-- ────────────────────────────────────────
-- PERFORMANCE INDEXES
-- ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_enrollments_student   ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course    ON public.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_completions_student   ON public.lesson_completions(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student      ON public.test_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student   ON public.assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_announcements_time    ON public.announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modules_course_order  ON public.modules(course_id, order_index);
CREATE INDEX IF NOT EXISTS idx_lessons_module_order  ON public.lessons(module_id, order_index);

-- ────────────────────────────────────────
-- AUTO-UPDATE updated_at
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────
-- ADMIN POLICIES (run after setting app_metadata)
-- Supabase checks (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
-- This is set when admin creates users via the API endpoint.
-- ────────────────────────────────────────

CREATE POLICY "admins_all_profiles" ON public.profiles
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_courses" ON public.courses
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_modules" ON public.modules
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_lessons" ON public.lessons
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_pdfs" ON public.lesson_pdfs
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_enrollments" ON public.enrollments
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_tests" ON public.practice_tests
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_questions" ON public.test_questions
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_attempts" ON public.test_attempts
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_assignments" ON public.assignments
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_submissions" ON public.assignment_submissions
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admins_all_announcements" ON public.announcements
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ────────────────────────────────────────
-- STORAGE BUCKETS (run separately if needed)
-- ────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public) VALUES ('pdfs', 'pdfs', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('assignments', 'assignments', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true);
