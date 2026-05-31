-- Migration v9: add parent contact fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_phone TEXT;
