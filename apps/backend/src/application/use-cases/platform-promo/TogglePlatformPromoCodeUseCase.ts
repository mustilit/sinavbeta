import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';

/**
 * Sprint 15 #3 — Admin promo kodunu aktif/pasif yapar.
 *
 * Silme yerine tercih edilen yöntem — usedCount korunur, raporlama bozulmaz.
 * UI varsayılan davranışı: "kullanımı durdur" → toggle pasife.
 */
export class TogglePlatformPromoCodeUseCase {
  constructor(private readonly auditRepo?: IAuditLogRepository) {}

  async execute(id: string, isActive: boolean, actorId: string) {
    const code = await prisma.platformPromoCode.findUnique({
      where: { id },
      select: { id: true, code: true, isActive: true },
    });
    if (!code) {
      throw new AppError('PROMO_NOT_FOUND', 'Promo kodu bulunamadı', 404);
    }
    if (code.isActive === isActive) {
      return code; // No-op
    }

    const updated = await prisma.platformPromoCode.update({
      where: { id },
      data: { isActive },
    });

    if (this.auditRepo) {
      try {
        await this.auditRepo.create({
          action: 'DISCOUNT_CREATED' as any, // TODO: PROMO_TOGGLED enum
          entityType: 'PlatformPromoCode',
          entityId: id,
          actorId,
          metadata: { code: code.code, isActive },
        });
      } catch {
        /* best-effort */
      }
    }

    return updated;
  }
}
