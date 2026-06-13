-- ================================================================
-- Dr Mai Portal — Migration v22
-- Run this in Supabase SQL Editor AFTER migration v21
--
-- Adds an internal chatroom: a single shared room where enrolled
-- students and admins can post messages. Messages persist for life;
-- they are only removed if their sender's account is deleted, or an
-- admin deletes the message.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'student',
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_time ON public.chat_messages(created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read the room.
DROP POLICY IF EXISTS "chat_read" ON public.chat_messages;
CREATE POLICY "chat_read" ON public.chat_messages
  FOR SELECT TO authenticated USING (true);

-- A user may post only as themselves.
DROP POLICY IF EXISTS "chat_insert_own" ON public.chat_messages;
CREATE POLICY "chat_insert_own" ON public.chat_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- A user may delete their own message; admins may delete any (moderation).
DROP POLICY IF EXISTS "chat_delete" ON public.chat_messages;
CREATE POLICY "chat_delete" ON public.chat_messages
  FOR DELETE TO authenticated USING (
    auth.uid() = sender_id
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Enable Supabase Realtime on the table (safe to re-run).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
