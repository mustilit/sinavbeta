import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const MAX_REASON = 1000;

/**
 * Aday yazılı test çözerken bir soru için "hata bildirimi" gönderir. Aktif satın
 * alma şart. Kayıt hafif (WrittenQuestionReport); eğitici/admin sonradan inceler.
 * Aday MyObjections'ta görür (ListMyWrittenQuestionReports merge).
 */
export class ReportWrittenQuestionUseCase {
  async execute(testId: string, input: { questionId?: string | null; reason: string }, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new AppError('REASON_REQUIRED', 'Bildirim metni gerekli', 400);

    const test = await prisma.writtenTest.findUnique({
      where: { id: testId },
      select: { id: true, packageId: true, tenantId: true },
    });
    if (!test || !test.packageId) throw new AppError('WRITTEN_TEST_NOT_FOUND', 'Test bulunamadı', 404);

    const purchase = await prisma.writtenPurchase.findUnique({
      where: { candidateId_packageId: { candidateId: actorId, packageId: test.packageId } },
      select: { status: true },
    });
    if (!purchase || purchase.status !== 'ACTIVE')
      throw new AppError('NOT_PURCHASED', 'Bu paketi satın almadınız', 403);

    const report = await prisma.writtenQuestionReport.create({
      data: {
        tenantId: test.tenantId,
        testId,
        questionId: input.questionId ?? null,
        candidateId: actorId,
        reason: reason.slice(0, MAX_REASON),
      },
      select: { id: true },
    });
    return { ok: true, id: report.id };
  }
}
