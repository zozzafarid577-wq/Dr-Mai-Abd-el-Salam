-- ================================================================
-- Dr Mai Portal — Migration v24
-- Run this in Supabase SQL Editor AFTER migration v23
--
-- Adds:
--   1. Sub-admins with partial access + protection for the OWNER
--      (the "main host"). profiles.is_owner + profiles.admin_perms.
--   2. wayground_tests — Wayground (Quizizz) test links the admin
--      can add for revision students (8 tests, version 1 & 2).
--   3. student_notes — general shared notes NOT tied to any test or
--      lesson.
--   4. (No schema change for multi-device alerts — they are logged
--      into the existing security_events table as event_type
--      'multi_device' by /api/register-session.)
-- ================================================================

-- ── 1. Sub-admins + owner protection ────────────────────────────
-- is_owner   → TRUE only for the single main host. Can never be
--              touched by another admin (enforced below).
-- admin_perms→ JSON array of permission keys a sub-admin is allowed,
--              e.g. ["students","announcements"]. The owner ignores
--              this list and always has everything.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_owner    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_perms JSONB   NOT NULL DEFAULT '[]'::jsonb;

-- Promote the first-created admin to OWNER so the protection is live
-- immediately. To pick a specific account instead, run:
--   UPDATE public.profiles p SET is_owner = true
--     FROM auth.users u
--    WHERE u.id = p.id AND u.email = 'you@example.com';
UPDATE public.profiles SET is_owner = true
 WHERE id = (
   SELECT id FROM public.profiles
    WHERE role = 'admin'
    ORDER BY created_at ASC
    LIMIT 1
 )
 AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_owner = true);

-- Helper: is the CURRENT signed-in user the owner? SECURITY DEFINER so
-- it reads profiles without tripping the table's own RLS (no recursion).
CREATE OR REPLACE FUNCTION public.auth_is_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_owner FROM public.profiles WHERE id = auth.uid()), false);
$$;

-- The owner row may only be UPDATED or DELETED by the owner themselves.
-- RESTRICTIVE policies are AND-combined with the permissive ones, so a
-- sub-admin (or anyone else) simply cannot write the owner's row.
DROP POLICY IF EXISTS "protect_owner_update" ON public.profiles;
CREATE POLICY "protect_owner_update" ON public.profiles
  AS RESTRICTIVE FOR UPDATE
  USING (is_owner = false OR public.auth_is_owner());

DROP POLICY IF EXISTS "protect_owner_delete" ON public.profiles;
CREATE POLICY "protect_owner_delete" ON public.profiles
  AS RESTRICTIVE FOR DELETE
  USING (is_owner = false OR public.auth_is_owner());

-- And nobody but the owner may set is_owner = true on any row
-- (stops a sub-admin from promoting themselves to the host tier).
DROP POLICY IF EXISTS "no_self_promote_owner" ON public.profiles;
CREATE POLICY "no_self_promote_owner" ON public.profiles
  AS RESTRICTIVE FOR UPDATE
  WITH CHECK (is_owner = false OR public.auth_is_owner());

-- ── 2. Wayground (Quizizz) test links ───────────────────────────
CREATE TABLE IF NOT EXISTS public.wayground_tests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_number INTEGER NOT NULL,            -- 1..8
  version     INTEGER NOT NULL DEFAULT 1,  -- 1 or 2
  title       TEXT,                        -- optional label
  url         TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (test_number, version)
);

ALTER TABLE public.wayground_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wayground_read" ON public.wayground_tests;
CREATE POLICY "wayground_read" ON public.wayground_tests
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "wayground_admin_all" ON public.wayground_tests;
CREATE POLICY "wayground_admin_all" ON public.wayground_tests
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP TRIGGER IF EXISTS wayground_updated_at ON public.wayground_tests;
CREATE TRIGGER wayground_updated_at
  BEFORE UPDATE ON public.wayground_tests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. General student notes (not tied to a test/lesson) ─────────
CREATE TABLE IF NOT EXISTS public.student_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT,                         -- free-text note
  file_url    TEXT,                         -- optional attached file / link
  audience    TEXT NOT NULL DEFAULT 'all',  -- 'all' | 'revision'
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_notes_read" ON public.student_notes;
CREATE POLICY "student_notes_read" ON public.student_notes
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "student_notes_admin_all" ON public.student_notes;
CREATE POLICY "student_notes_admin_all" ON public.student_notes
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE INDEX IF NOT EXISTS idx_student_notes_time ON public.student_notes(created_at DESC);
