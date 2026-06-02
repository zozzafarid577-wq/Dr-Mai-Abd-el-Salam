-- Migration v12: Allow NULL correct_index in test_questions
-- Grouped "Choose Term" questions store per-statement answers in the statements
-- JSONB column, so correct_index is meaningless and must be nullable.
ALTER TABLE test_questions ALTER COLUMN correct_index DROP NOT NULL;
