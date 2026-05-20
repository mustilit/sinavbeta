-- Add difficulty to test_packages (easy | medium | hard), default medium
ALTER TABLE "test_packages" ADD COLUMN IF NOT EXISTS "difficulty" TEXT NOT NULL DEFAULT 'medium';
