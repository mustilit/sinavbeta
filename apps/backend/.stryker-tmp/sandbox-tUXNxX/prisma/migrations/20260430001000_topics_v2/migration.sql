-- Topics V2: many-to-many exam types + parent-child hierarchy

-- 1. Add parentId to topics (nullable)
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

-- 2. Create junction table
CREATE TABLE IF NOT EXISTS "topic_exam_types" (
    "topicId"    TEXT NOT NULL,
    "examTypeId" TEXT NOT NULL,
    CONSTRAINT "topic_exam_types_pkey" PRIMARY KEY ("topicId","examTypeId")
);

-- 3. Migrate existing examTypeId data → junction table
INSERT INTO "topic_exam_types" ("topicId", "examTypeId")
SELECT "id", "examTypeId" FROM "topics"
WHERE "examTypeId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Drop old unique constraint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topics_examTypeId_slug_key') THEN
    ALTER TABLE "topics" DROP CONSTRAINT "topics_examTypeId_slug_key";
  END IF;
END $$;

-- 5. Drop examTypeId column from topics
ALTER TABLE "topics" DROP COLUMN IF EXISTS "examTypeId";

-- 6. Foreign keys for topic_exam_types
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topic_exam_types_topicId_fkey') THEN
    ALTER TABLE "topic_exam_types"
      ADD CONSTRAINT "topic_exam_types_topicId_fkey"
      FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topic_exam_types_examTypeId_fkey') THEN
    ALTER TABLE "topic_exam_types"
      ADD CONSTRAINT "topic_exam_types_examTypeId_fkey"
      FOREIGN KEY ("examTypeId") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 7. Self-referential FK for parentId
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'topics_parentId_fkey') THEN
    ALTER TABLE "topics"
      ADD CONSTRAINT "topics_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
