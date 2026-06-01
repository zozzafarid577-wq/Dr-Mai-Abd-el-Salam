-- Migration v10: Add statements column to question_bank for grouped Choose Term questions
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS statements JSONB;
