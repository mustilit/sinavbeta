-- "Paketi yeniden çöz" işareti: aday bir paket için sıfırlama yaptığında now() yazılır.
-- Bu tarihten önce başlamış denemeler "geçmiş tur" sayılır (UI'da test Başla'ya döner).
ALTER TABLE "purchases" ADD COLUMN "attemptsResetAt" TIMESTAMP(3);
