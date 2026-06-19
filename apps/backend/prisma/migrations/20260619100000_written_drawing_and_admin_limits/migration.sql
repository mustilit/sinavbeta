-- AlterTable
ALTER TABLE "admin_settings" ADD COLUMN     "maxQuestionsPerWrittenTest" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "maxWrittenTestsPerPackage" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "minQuestionsPerWrittenTest" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "written_answers" ADD COLUMN     "drawingUrl" TEXT;
