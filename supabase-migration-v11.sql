-- Migration v11: support grouped "Choose Term" questions inside tests
-- Lets a test question hold multiple statements + a shared term pool as ONE question.

ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'mcq';
ALTER TABLE test_questions ADD COLUMN IF NOT EXISTS statements JSONB;

-- (question_bank.statements is added in migration v10; included here for safety)
ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS statements JSONB;
