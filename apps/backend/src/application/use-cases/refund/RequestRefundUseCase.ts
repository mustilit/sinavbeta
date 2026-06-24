import { AppError } from '../../errors/AppError';
import { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';
import { IPurchaseRepository } from '../../../domain/interfaces/IPurchaseRepository';
import { IAttemptRepository } from '../../../domain/interfaces/IAttemptRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { prisma } from '../../../infrastructure/database/prisma';

/** UUID doğrulama regex'i — purchaseId formatı bu kuralla kontrol edilir. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** İade yapılabilecek maksimum gün sayısı (satın alma tarihinden itibaren). */
const REFUND_WINDOW_DAYS = 7;
/** İade penceresi milisaniye cinsinden. */
const REFUND_WINDOW_MS = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
/** Educator'ın inceleme süresi (gün). */
const EDUCATOR_REVIEW_DAYS = 7;

/**
 * Aday tarafından iade talebi oluşturur.
 * İade kuralları:
 * - Satın alma tarihinden itibaren 7 gün içinde talep edilmelidir.
 * - Test denemesi başlatılmışsa iade yapılamaz.
 * - Aynı satın alma için birden fazla iade talebi açılamaz.
 * - Gerekçe belirtilmişse en az 5 karakter olmalıdır.
 * Yeni davranış:
 * - educatorId ve educatorDeadline otomatik atanır.
 */
export class RequestRefundUseCase {
  constructor(
    private readonly refundRepo: IRefundRepository,
    private readonly purchaseRepo: IPurchaseRepository,
    private readonly attemptRepo: IAttemptRepository,
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  /**
   * İade talebi oluşturur.
   * @param input.purchaseId  - İade talep edilecek satın almanın ID'si (UUID formatında).
   * @param input.reason      - Gerekçe metni (opsiyonel, 5+ karakter).
   * @param input.description - Açıklama metni (opsiyonel).
   * @param actorId           - Talebi yapan kullanıcının ID'si; yoksa 401 fırlatır.
   */
  async execute(
    input: { purchaseId: string; reason?: string; description?: string; source?: 'TEST' | 'TUNNEL' | 'WRITTEN' },
    actorId: string | undefined,
  ): Promise<{
    id: string;
    source: string;
    purchaseId: string | null;
    candidateId: string;
    educatorId: string;
    testId: string | null;
    reason: string | null;
    status: string;
    educatorDeadline: string | null;
    createdAt: string;
  }> {
    if (!actorId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }
    // TUNNEL/WRITTEN kaynaklı iadeler ayrı akıştan geçer (test paketinden bağımsız satın alma)
    if (input.source === 'TUNNEL' || input.source === 'WRITTEN') {
      return this.executeForModule(input.source, input, actorId);
    }
    if (!UUID_REGEX.test(input.purchaseId)) {
      throw new AppError('INVALID_UUID', 'Invalid purchaseId', 400);
    }

    const purchase = await this.purchaseRepo.findById(input.purchaseId);
    if (!purchase) {
      throw new AppError('PURCHASE_NOT_FOUND', 'Purchase not found', 404);
    }
    // Sadece satın almanın sahibi iade talep edebilir
    if (purchase.candidateId !== actorId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the purchase owner can request a refund', 403);
    }

    // 7 günlük iade penceresi kontrolü
    const elapsedMs = Date.now() - new Date(purchase.createdAt).getTime();
    if (elapsedMs > REFUND_WINDOW_MS) {
      throw new AppError('REFUND_WINDOW_EXPIRED', 'Refund window has expired (7 days from purchase)', 409);
    }

    if (!purchase.testId) {
      throw new AppError('PURCHASE_NOT_FOUND', 'Purchase has no associated test', 404);
    }

    // Test denemesi başlatılmışsa iade yapılamaz.
    // Paket satın alımında purchase.testId yalnızca paketin ilk testidir;
    // candidate paketteki BAŞKA bir teste de attempt açmış olabilir.
    // Bu nedenle paketin tüm test ID'lerini topla ve hepsini kontrol et.
    const packageId = (purchase as any).packageId ?? null;
    const packageTestIds: string[] = packageId
      ? (await prisma.examTest.findMany({
          where: { packageId, deletedAt: null },
          select: { id: true },
        })).map((t) => t.id)
      : [];
    const testIdsToCheck = Array.from(new Set([purchase.testId as string, ...packageTestIds]));

    const attemptCount = await prisma.testAttempt.count({
      where: { candidateId: actorId, testId: { in: testIdsToCheck } },
    });
    if (attemptCount > 0) {
      throw new AppError(
        'REFUND_NOT_ALLOWED_ATTEMPT_STARTED',
        'Refund not allowed: you have already started an attempt for a test in this package',
        409,
      );
    }

    // Aynı satın alma için tekrar iade talebi açılamaz
    const existing = await this.refundRepo.findByPurchaseId(input.purchaseId);
    if (existing) {
      throw new AppError('REFUND_ALREADY_REQUESTED', 'A refund has already been requested for this purchase', 409);
    }

    const reason = input.reason?.trim();
    // Gerekçe belirtilmişse minimum 5 karakter zorunludur
    if (reason != null && reason !== '' && reason.length < 5) {
      throw new AppError('REASON_TOO_SHORT', 'Reason must be at least 5 characters if provided', 400);
    }

    // Testin educatorId'sini bul
    const test = await prisma.examTest.findUnique({
      where: { id: purchase.testId as string },
      select: { educatorId: true },
    });
    const educatorId = test?.educatorId ?? '';

    const educatorDeadline = new Date(Date.now() + EDUCATOR_REVIEW_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.refundRepo.create({
      source: 'TEST',
      purchaseId: input.purchaseId,
      candidateId: actorId,
      educatorId,
      testId: purchase.testId as string,
      reason: reason ?? undefined,
      description: input.description?.trim() || undefined,
      educatorDeadline,
    });

    try {
      await this.auditRepo.create({
        action: 'REFUND_REQUESTED',
        entityType: 'REFUND',
        entityId: created.id,
        actorId,
        metadata: { source: 'TEST', purchaseId: input.purchaseId, testId: purchase.testId },
      });
    } catch {
      // best-effort
    }

    return {
      id: created.id,
      source: created.source,
      purchaseId: created.purchaseId,
      candidateId: created.candidateId,
      educatorId: created.educatorId,
      testId: created.testId,
      reason: created.reason ?? null,
      status: created.status,
      educatorDeadline: created.educatorDeadline ?? null,
      createdAt: typeof created.createdAt === 'string' ? created.createdAt : new Date(created.createdAt).toISOString(),
    };
  }

  /**
   * TUNNEL/WRITTEN kaynaklı iade talebi. Test paketinden bağımsız satın alma
   * (TunnelPurchase/WrittenPurchase) üzerine çalışır; aynı kurallar:
   *  - 7 gün iade penceresi (satın alma tarihinden)
   *  - çözmeye başlanmışsa (attempt var) iade yok
   *  - aynı satın alma için tek talep
   *  - educatorId içerik sahibinden çözülür
   */
  private async executeForModule(
    source: 'TUNNEL' | 'WRITTEN',
    input: { purchaseId: string; reason?: string; description?: string },
    actorId: string,
  ) {
    if (!UUID_REGEX.test(input.purchaseId)) {
      throw new AppError('INVALID_UUID', 'Invalid purchaseId', 400);
    }

    const reason = input.reason?.trim();
    if (reason != null && reason !== '' && reason.length < 5) {
      throw new AppError('REASON_TOO_SHORT', 'Reason must be at least 5 characters if provided', 400);
    }

    const educatorDeadline = new Date(Date.now() + EDUCATOR_REVIEW_DAYS * 24 * 60 * 60 * 1000);

    if (source === 'TUNNEL') {
      const tp = await prisma.tunnelPurchase.findUnique({ where: { id: input.purchaseId } });
      if (!tp) throw new AppError('PURCHASE_NOT_FOUND', 'Purchase not found', 404);
      if (tp.candidateId !== actorId) throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the purchase owner can request a refund', 403);
      if (tp.status !== 'ACTIVE') throw new AppError('REFUND_NOT_ALLOWED', 'Purchase is not refundable', 409);

      if (Date.now() - new Date(tp.createdAt).getTime() > REFUND_WINDOW_MS) {
        throw new AppError('REFUND_WINDOW_EXPIRED', 'Refund window has expired (7 days from purchase)', 409);
      }

      // Çözmeye başlanmışsa iade yok
      const attemptCount = await prisma.tunnelAttempt.count({ where: { candidateId: actorId, tunnelId: tp.tunnelId } });
      if (attemptCount > 0) {
        throw new AppError('REFUND_NOT_ALLOWED_ATTEMPT_STARTED', 'Refund not allowed: you have already started this tunnel', 409);
      }

      const existing = await this.refundRepo.findBySourcePurchaseId('TUNNEL', input.purchaseId);
      if (existing) throw new AppError('REFUND_ALREADY_REQUESTED', 'A refund has already been requested for this purchase', 409);

      const tunnel = await prisma.tunnel.findUnique({ where: { id: tp.tunnelId }, select: { educatorId: true } });

      const created = await this.refundRepo.create({
        source: 'TUNNEL',
        tunnelPurchaseId: tp.id,
        tunnelId: tp.tunnelId,
        candidateId: actorId,
        educatorId: tunnel?.educatorId ?? '',
        reason: reason ?? undefined,
        description: input.description?.trim() || undefined,
        educatorDeadline,
      });
      try {
        await this.auditRepo.create({
          action: 'REFUND_REQUESTED',
          entityType: 'REFUND',
          entityId: created.id,
          actorId,
          metadata: { source: 'TUNNEL', tunnelPurchaseId: tp.id, tunnelId: tp.tunnelId },
        });
      } catch { /* best-effort */ }
      return this.serializeCreated(created);
    }

    // WRITTEN
    const wp = await prisma.writtenPurchase.findUnique({ where: { id: input.purchaseId } });
    if (!wp) throw new AppError('PURCHASE_NOT_FOUND', 'Purchase not found', 404);
    if (wp.candidateId !== actorId) throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the purchase owner can request a refund', 403);
    if (wp.status !== 'ACTIVE') throw new AppError('REFUND_NOT_ALLOWED', 'Purchase is not refundable', 409);

    if (Date.now() - new Date(wp.createdAt).getTime() > REFUND_WINDOW_MS) {
      throw new AppError('REFUND_WINDOW_EXPIRED', 'Refund window has expired (7 days from purchase)', 409);
    }

    // Paketteki herhangi bir teste attempt açılmışsa iade yok
    const testIds = (await prisma.writtenTest.findMany({ where: { packageId: wp.packageId, deletedAt: null }, select: { id: true } })).map((t) => t.id);
    if (testIds.length > 0) {
      const attemptCount = await prisma.writtenAttempt.count({ where: { candidateId: actorId, testId: { in: testIds } } });
      if (attemptCount > 0) {
        throw new AppError('REFUND_NOT_ALLOWED_ATTEMPT_STARTED', 'Refund not allowed: you have already started a test in this package', 409);
      }
    }

    const existing = await this.refundRepo.findBySourcePurchaseId('WRITTEN', input.purchaseId);
    if (existing) throw new AppError('REFUND_ALREADY_REQUESTED', 'A refund has already been requested for this purchase', 409);

    const pkg = await prisma.writtenPackage.findUnique({ where: { id: wp.packageId }, select: { educatorId: true } });

    const created = await this.refundRepo.create({
      source: 'WRITTEN',
      writtenPurchaseId: wp.id,
      writtenPackageId: wp.packageId,
      candidateId: actorId,
      educatorId: pkg?.educatorId ?? '',
      reason: reason ?? undefined,
      description: input.description?.trim() || undefined,
      educatorDeadline,
    });
    try {
      await this.auditRepo.create({
        action: 'REFUND_REQUESTED',
        entityType: 'REFUND',
        entityId: created.id,
        actorId,
        metadata: { source: 'WRITTEN', writtenPurchaseId: wp.id, writtenPackageId: wp.packageId },
      });
    } catch { /* best-effort */ }
    return this.serializeCreated(created);
  }

  private serializeCreated(created: any) {
    return {
      id: created.id,
      source: created.source,
      purchaseId: created.purchaseId ?? null,
      candidateId: created.candidateId,
      educatorId: created.educatorId,
      testId: created.testId ?? null,
      reason: created.reason ?? null,
      status: created.status,
      educatorDeadline: created.educatorDeadline ?? null,
      createdAt: typeof created.createdAt === 'string' ? created.createdAt : new Date(created.createdAt).toISOString(),
    };
  }
}
