import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { AppError } from '../../errors/AppError';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';
import { logger } from '../../../infrastructure/logger/logger';

/**
 * Test metadata güncelleme (title, priceCents, duration, isTimed, hasSolutions,
 * coverImageUrl, campaign*).
 *
 * Logging disiplini (observability skill §"Audit log zorunluluğu"):
 *  - Fiyat değişimi → `PRICE_CHANGED` AuditAction ile auditRepository'e yazılır.
 *  - Diğer metadata değişiklikleri → structured `logger.info('test.metadata.updated', ...)` ile
 *    diff (changedFields) loglanır. Audit enum'da TEST_UPDATED henüz tanımlı değil — bu
 *    kayıtlar yapılandırılmış log akışında izlenir. (Migration sonrası AuditLog'a taşınabilir.)
 *  - Failure path'lerinde AppError fırlatılır → HttpExceptionFilter 5xx ise Sentry'ye iletir.
 */
export class UpdateTestUseCase {
  constructor(
    private readonly examRepository: IExamRepository,
    private readonly auditRepository: IAuditLogRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(
    testId: string,
    updates: {
      title?: string;
      priceCents?: number;
      duration?: number;
      isTimed?: boolean;
      hasSolutions?: boolean;
      campaignPriceCents?: number | null;
      campaignValidFrom?: Date | null;
      campaignValidUntil?: Date | null;
      coverImageUrl?: string | null;
      gradeLevelId?: string | null;
    },
    actorId?: string,
  ) {
    if (actorId) {
      const user = await this.userRepository.findById(actorId);
      if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
      ensureEducatorActive(user);
    }

    const test = await this.examRepository.findById(testId);
    if (!test) throw new AppError('TEST_NOT_FOUND', 'Test not found', 404);

    if (actorId && test.educatorId && test.educatorId !== actorId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the educator who owns the test can update it', 403);
    }

    const oldPriceCents = (test as any).priceCents ?? null;
    const newPriceCents = updates.priceCents;
    const priceChanged = typeof newPriceCents === 'number' && newPriceCents !== oldPriceCents;

    // Diff snapshot — değişen alanları structured log'a yazmak için.
    const before: Record<string, unknown> = {
      title: (test as any).title,
      priceCents: oldPriceCents,
      duration: (test as any).duration,
      isTimed: (test as any).isTimed,
      hasSolutions: (test as any).hasSolutions,
      campaignPriceCents: (test as any).campaignPriceCents,
      campaignValidFrom: (test as any).campaignValidFrom,
      campaignValidUntil: (test as any).campaignValidUntil,
      coverImageUrl: (test as any).coverImageUrl,
    };

    const updated = await this.examRepository.updateTestMetadata(testId, {
      title: updates.title,
      priceCents: updates.priceCents,
      duration: updates.duration,
      isTimed: updates.isTimed,
      hasSolutions: updates.hasSolutions,
      campaignPriceCents: updates.campaignPriceCents,
      campaignValidFrom: updates.campaignValidFrom,
      campaignValidUntil: updates.campaignValidUntil,
      coverImageUrl: updates.coverImageUrl,
      gradeLevelId: updates.gradeLevelId,
    });
    if (!updated) {
      // Failure path da loglanır — "olmadı" olayı "oldu" kadar önemlidir (observability skill).
      logger.warn('test.metadata.update_failed', { testId, actorId: actorId ?? null });
      throw new AppError('UPDATE_FAILED', 'Failed to update test', 400);
    }

    if (priceChanged) {
      try {
        await this.auditRepository.create({
          action: 'PRICE_CHANGED',
          entityType: 'ExamTest',
          entityId: testId,
          actorId: actorId ?? null,
          metadata: { oldPriceCents, newPriceCents },
        });
      } catch (err) {
        // Audit yazımı use case akışını blok etmez ama görünmez de olmasın.
        logger.warn('audit.write_failed', {
          action: 'PRICE_CHANGED',
          entityType: 'ExamTest',
          entityId: testId,
          error: (err as Error)?.message,
        });
      }
    }

    // Non-price metadata değişiklikleri için structured log (diff). AuditAction
    // enum'da TEST_UPDATED yok; migration'a kadar yapılandırılmış log akışı kullanılır.
    const changedFields = Object.keys(updates).filter((k) => {
      const newVal = (updates as Record<string, unknown>)[k];
      if (newVal === undefined) return false;
      return newVal !== (before as Record<string, unknown>)[k];
    });
    if (changedFields.length > 0) {
      logger.info('test.metadata.updated', {
        testId,
        actorId: actorId ?? null,
        changedFields,
        priceChanged,
      });
    }

    return updated;
  }
}
