// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';

/**
 * Admin tarafından bekleyen bir iade talebini reddeder.
 * - Sadece PENDING statüsündeki talepler reddedilebilir.
 * - Red işlemi audit log'a kaydedilir (best-effort).
 */
export class RejectRefundUseCase {
  constructor(
    private readonly refundRepo: IRefundRepository,
    private readonly auditRepo: IAuditLogRepository,
  ) {}

  /**
   * İade talebini reddeder ve karar bilgisini döner.
   * @param refundId - Reddedilecek iade talebinin ID'si.
   * @param actorId  - İşlemi yapan admin kullanıcısının ID'si; yoksa 401 fırlatır.
   * @param reason   - Ret gerekçesi (opsiyonel).
   */
  async execute(
    refundId: string,
    actorId: string | undefined,
    reason?: string,
  ): Promise<{ id: string; status: string; decidedAt: string }> {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    const refund = await this.refundRepo.findById(refundId);
    if (!refund) throw new AppError('REFUND_NOT_FOUND', 'Refund request not found', 404);
    // Admin yalnızca educator'ın onayladığı, aday itiraz ettiği veya süresi dolmuş talepleri reddedebilir
    const adminRejectableStatuses = ['EDUCATOR_APPROVED', 'APPEAL_PENDING', 'ESCALATED'];
    if (!adminRejectableStatuses.includes(refund.status)) {
      throw new AppError('REFUND_NOT_ACTIONABLE', 'Refund is not in a state that admin can reject', 409);
    }

    const now = new Date();
    const updated = await this.refundRepo.reject(refundId, actorId, now, reason);

    // Audit kaydı başarısız olsa bile red işlemi geri alınmaz
    try {
      await this.auditRepo.create({
        action: 'REFUND_REJECTED',
        entityType: 'REFUND',
        entityId: refundId,
        actorId,
        metadata: reason ? { reason } : {},
      });
    } catch {
      // best-effort
    }

    return {
      id: updated.id,
      status: updated.status,
      // decidedAt string veya Date olabilir — ISO formatında normalize edilir
      decidedAt: typeof updated.decidedAt === 'string' ? updated.decidedAt : (updated.decidedAt ? new Date(updated.decidedAt).toISOString() : now.toISOString()),
    };
  }
}
