-- ================================================================
-- Dr Mai Portal — Migration v23
-- Run this in Supabase SQL Editor AFTER migration v22
--
-- Adds:
--   1. chat_messages.image_url + a public "chat-uploads" bucket so
--      students can post pictures in the chatroom.
--   2. security_events — a log of copy / right-click / suspicious
--      actions so the admin can see if a student breaks the rules.
-- ================================================================

-- ── 1. Chat images ──────────────────────────────────────────────
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
-- The body can be empty when a message is just an image.
ALTER TABLE public.chat_messages ALTER COLUMN body SET DEFAULT '';

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-uploads', 'chat-uploads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "chatup_read" ON storage.objects;
CREATE POLICY "chatup_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-uploads');

DROP POLICY IF EXISTS "chatup_insert" ON storage.objects;
CREATE POLICY "chatup_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-uploads');

DROP POLICY IF EXISTS "chatup_delete" ON storage.objects;
CREATE POLICY "chatup_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'chat-uploads'
    AND (owner = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

-- ── 2. Security / rule-break log ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_name TEXT,
  event_type   TEXT NOT NULL,         -- 'copy' | 'contextmenu' | 'devtools' | …
  detail       TEXT,
  page         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_security_events_time ON public.security_events(created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- A student may log their own events; admins may read everything.
DROP POLICY IF EXISTS "secev_insert_own" ON public.security_events;
CREATE POLICY "secev_insert_own" ON public.security_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "secev_admin_read" ON public.security_events;
CREATE POLICY "secev_admin_read" ON public.security_events
  FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "secev_admin_all" ON public.security_events;
CREATE POLICY "secev_admin_all" ON public.security_events
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
