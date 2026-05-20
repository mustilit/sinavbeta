-- Add mediaUrl to exam_questions and exam_options for image support
ALTER TABLE "exam_questions" ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT;
ALTER TABLE "exam_options" ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT;
