-- ================================================================
-- Dr Mai Portal — Migration v25
-- Run this in the Supabase SQL Editor.
--
-- Purpose: promote an EXISTING auth account to a full sub-admin.
-- Use this when the Team → "Add admin" button says
--   "A user with this email address has already been registered"
-- but the person still can't act as an admin (their account has no
-- admin role / profile, so the portal treats them as "not there").
--
-- This does NOT change the main host (owner) — the new admin is a
-- normal sub-admin with every permission ticked. After running it,
-- open the Team page, find the account, and click "Resend login" to
-- set and send a fresh password (the old password is unknown).
-- ================================================================

DO $$
DECLARE
  -- ▼▼ Edit these two lines if you reuse this for a different person ▼▼
  target_email TEXT := 'mai.mohamed.ahmed.1481979@gmail.com';
  target_name  TEXT := 'Mai Mohamed';
  -- ▲▲ ----------------------------------------------------------- ▲▲
  uid UUID;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = target_email;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No auth user found with email % — create it via Team → Add admin instead.', target_email;
  END IF;

  -- 1. JWT role claim so the API trusts this account as an admin.
  UPDATE auth.users
     SET raw_app_meta_data =
           COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   WHERE id = uid;

  -- 2. Admin profile with full permissions. Creates the row if it is
  --    missing, or upgrades an existing (e.g. student) row in place.
  INSERT INTO public.profiles
    (id, role, full_name, is_owner, admin_perms, is_active, must_change_pw)
  VALUES
    (uid, 'admin', target_name, false,
     '["students","courses","questions","tests","assignments","announcements","wayground","notes","security","chat"]'::jsonb,
     true, true)
  ON CONFLICT (id) DO UPDATE
     SET role        = 'admin',
         is_owner    = false,                 -- never the main host
         admin_perms = EXCLUDED.admin_perms,  -- full access
         is_active   = true;

  RAISE NOTICE 'Promoted % (%) to a full sub-admin. Use Team → Resend login to send a password.', target_email, uid;
END $$;
