import { prisma } from '../database/prisma';
import { IPurchaseRepository, PurchaseRecord, PurchaseWithAttemptRecord } from '../../domain/interfaces/IPurchaseRepository';

export class PrismaPurchaseRepository implements IPurchaseRepository {
  async hasPurchase(testId: string, candidateId: string): Promise<boolean> {
    // 1) Doğrudan testId üzerinden eşleşme (eski sistem veya tekil test satın alma)
    const direct = await prisma.purchase.count({ where: { testId, candidateId } });
    if (direct > 0) return true;

    // 2) Paket satın alma: ilgili test bir TestPackage'a aitse, candidate'in o paket
    //    için Purchase'ı var mı? `Purchase.packageId === ExamTest.packageId`
    const test = await prisma.examTest.findUnique({
      where: { id: testId },
      select: { packageId: true },
    });
    if (test?.packageId) {
      const pkgCount = await (prisma.purchase as any).count({
        where: { packageId: test.packageId, candidateId },
      });
      return pkgCount > 0;
    }
    return false;
  }

  async findById(purchaseId: string): Promise<PurchaseRecord | null> {
    const row = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: { id: true, testId: true, candidateId: true, createdAt: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      testId: row.testId,
      candidateId: row.candidateId,
      createdAt: row.createdAt,
    };
  }

  async findByCandidateId(candidateId: string): Promise<PurchaseWithAttemptRecord[]> {
    const withRelations = await (prisma.purchase as any).findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
      include: {
        test: { select: { id: true, title: true, status: true, examTypeId: true, _count: { select: { questions: true } } } },
        package: {
          // Frontend (MyTests) eski hâlinde her purchase için ayrı GET /marketplace/packages/:id
          // çağrısı yapıyordu — N+1 + bir tanesi fail edince tüm liste boşalıyordu.
          // Şimdi card'ın ihtiyaç duyduğu tüm alanlar tek query ile gelir.
          select: {
            id: true,
            title: true,
            description: true,
            coverImageUrl: true,
            priceCents: true,
            difficulty: true,
            publishedAt: true,
            educatorId: true,
            educator: { select: { username: true } },
            tests: {
              where: { deletedAt: null },
              select: {
                id: true,
                title: true,
                examTypeId: true,
                examType: { select: { id: true, name: true } },
                _count: { select: { questions: true } },
              },
            },
          },
        },
      },
    });

    const attempts = await prisma.testAttempt.findMany({
      where: { candidateId },
      // Çok-denemeli: attemptNumber ASC → aynı test için EN SON deneme Map'te en son
      // yazılır (kazanır). Sırasız bırakılırsa hangi turun tutulacağı belirsizdi.
      orderBy: [{ attemptNumber: 'asc' }] as any,
      select: {
        id: true,
        testId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        submittedAt: true,
        score: true,
        overtimeSeconds: true,
        metadata: true,
        answers: { select: { isCorrect: true, selectedOptionId: true } },
      },
    });
    const attemptByTest = new Map(attempts.map((a) => [a.testId, a]));

    // Tek attempt'ı zenginleştir (correct/wrong/empty count ekler)
    const enrich = (a: any) => {
      const answers: Array<{ isCorrect: boolean | null; selectedOptionId: string | null }> =
        a.answers ?? [];
      const correctCount = answers.filter((x) => x.isCorrect === true).length;
      const wrongCount = answers.filter((x) => x.isCorrect === false && x.selectedOptionId != null).length;
      const emptyCount = answers.filter((x) => !x.selectedOptionId).length;
      const { answers: _answers, ...rest } = a;
      return { ...rest, correctCount, wrongCount, emptyCount };
    };

    return (withRelations as any[]).map((p) => {
      const rawAttempt = p.testId ? (attemptByTest.get(p.testId) ?? null) : null;
      const attempt = rawAttempt ? enrich(rawAttempt) : null;

      // Paket içindeki TÜM testlerin attempt'larını ekle —
      // frontend "in progress" durumunu doğru tesste gösterebilsin
      const pkgTestIds: string[] = (p.package?.tests ?? []).map((t: any) => t.id);
      const attemptsAll = pkgTestIds
        .map((tid) => attemptByTest.get(tid))
        .filter(Boolean)
        .map((a: any) => enrich(a));

      return {
        id: p.id,
        testId: p.testId ?? null,
        packageId: p.packageId ?? null,
        candidateId: p.candidateId,
        createdAt: p.createdAt,
        amountCents: p.amountCents ?? null,
        paymentStatus: p.status ?? null,
        // "Paketi yeniden çöz" işareti — bu tarihten önce başlamış denemeler "geçmiş tur".
        // Home "Devam Et" + diğer tüketiciler bu turu hesaplamak için kullanır.
        attemptsResetAt: p.attemptsResetAt ?? null,
        test: p.test ?? null,
        package: p.package ?? null,
        attempt,
        attempts: attemptsAll,
      } as any;
    });
  }
}

