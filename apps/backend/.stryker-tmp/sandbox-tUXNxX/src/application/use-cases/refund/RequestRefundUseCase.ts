// @ts-nocheck
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
    input: { purchaseId: string; reason?: string; description?: string },
    actorId: string | undefined,
  ): Promise<{
    id: string;
    purchaseId: string;
    candidateId: string;
    educatorId: string;
    testId: string;
    reason: string | null;
    status: string;
    educatorDeadline: string | null;
    createdAt: string;
  }> {
    if (!actorId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
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
    // Test denemesi başlatılmışsa iade yapılamaz
    const hasAttempt = await this.attemptRepo.hasAnyAttempt(purchase.testId, actorId);
    if (hasAttempt) {
      throw new AppError(
        'REFUND_NOT_ALLOWED_ATTEMPT_STARTED',
        'Refund not allowed: you have already started an attempt for this test',
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
        metadata: { purchaseId: input.purchaseId, testId: purchase.testId },
      });
    } catch {
      // best-effort
    }

    return {
      id: created.id,
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
}
