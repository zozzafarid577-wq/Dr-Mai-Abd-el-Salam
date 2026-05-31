-- ================================================================
-- Dr Mai Portal — Migration v6
-- Run this in Supabase SQL Editor AFTER migration v5
-- ================================================================

-- ── Add session_token to profiles (single-session enforcement) ───
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_token TEXT;
