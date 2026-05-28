import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';

/**
 * Sprint 15 #3 — Admin promo kodunu siler.
 *
 * Hard delete: PlatformPromoCodeUsage kayıtları onDelete: CASCADE ile silinir.
 * Bu kayıplı bir işlem — usedCount > 0 olan kodu silmek raporlamayı bozar.
 * Best practice: silmek yerine `isActive=false` (toggle). Bu use case yine de
 * sağlanır (admin kararı) ama UI uyarı göstermeli.
 */
export class DeletePlatformPromoCodeUseCase {
  constructor(private readonly auditRepo?: IAuditLogRepository) {}

  async execute(id: string, actorId: string) {
    const code = await prisma.platformPromoCode.findUnique({
      where: { id },
      select: { id: true, code: true, usedCount: true },
    });
    if (!code) {
      throw new AppError('PROMO_NOT_FOUND', 'Promo kodu bulunamadı', 404);
    }

    await prisma.platformPromoCode.delete({ where: { id } });

    if (this.auditRepo) {
      try {
        await this.auditRepo.create({
          action: 'DISCOUNT_CREATED' as any, // TODO: PROMO_DELETED enum
          entityType: 'PlatformPromoCode',
          entityId: id,
          actorId,
          metadata: { code: code.code, usedCount: code.usedCount, deleted: true },
        });
      } catch {
        /* best-effort */
      }
    }

    return { ok: true };
  }
}
