-- Add assignment type columns (practice_test / mock_test / file)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'file';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS test_id UUID REFERENCES practice_tests(id) ON DELETE SET NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS is_automated BOOLEAN DEFAULT false;
