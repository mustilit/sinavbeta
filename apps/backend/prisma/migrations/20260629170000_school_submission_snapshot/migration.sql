-- E-Sınıf: teslim anı soru snapshot'ı — sınav güncellenince geçmiş sonuç/inceleme bozulmaz.
ALTER TABLE "school_submissions" ADD COLUMN "questionsSnapshot" JSONB;
