-- ================================================================
-- Dr Mai Portal — Migration v21
-- Run this in Supabase SQL Editor AFTER migration v20
--
-- Adds a category to lesson PDFs so the portal can group them into
-- the Revision tabs: Material, Summary, Cheat sheet, and Retest.
--   'material'  → normal lesson PDF (default)
--   'summary'   → revision summary
--   'cheat'     → cheat sheet / "cheat codes"
--   'retest'    → retest material
-- ================================================================

ALTER TABLE public.module_pdfs
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'material';
