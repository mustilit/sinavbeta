-- E-Sınıf tünel: katmanlı yapı (market tünel deseni). Additive, nullable/defaultlu.
ALTER TABLE "school_exams" ADD COLUMN "layerCount" INTEGER;
ALTER TABLE "school_exams" ADD COLUMN "optionsPerQuestion" INTEGER;
ALTER TABLE "school_exams" ADD COLUMN "advanceStreak" INTEGER;
ALTER TABLE "school_questions" ADD COLUMN "layerIndex" INTEGER NOT NULL DEFAULT 1;
