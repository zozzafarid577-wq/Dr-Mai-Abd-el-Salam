-- ================================================================
-- Dr Mai Portal — Migration v20
-- Run this in Supabase SQL Editor AFTER migration v19
--
-- Single-device login already works via profiles.session_token (the
-- newest login rotates the token and kicks older devices on their next
-- page load). This migration adds light login tracking so you can see
-- WHEN and from WHERE each student last signed in.
-- ================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_ua TEXT;
