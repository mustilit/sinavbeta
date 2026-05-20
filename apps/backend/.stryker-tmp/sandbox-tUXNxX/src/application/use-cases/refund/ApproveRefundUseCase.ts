// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { RefundProcessor } from '../../services/RefundProcessor';

/**
 * Bekleyen bir iade talebini admin tarafından onaylar.
 *
 * Onay sonrası RefundProcessor üzerinden ödeme iadesi tetiklenir.
 * Yalnızca PENDING durumundaki talepler onaylanabilir; daha önce
 * karara bağlanmış talepler için 409 hatası fırlatılır.
 */
export class ApproveRefundUseCase {
  constructor(
    private readonly refundRepo: IRefundRepository,
    private readonly auditRepo: IAuditLogRepository,
    private readonly processor: RefundProcessor,
  ) {}

  /**
   * İade talebini onaylar ve ödeme iadesini başlatır.
   *
   * @param refundId - Onaylanacak iade talebinin kimliği
   * @param actorId  - İşlemi gerçekleştiren admin kullanıcısının kimliği
   * @returns Güncellenmiş iade bilgileri (id, durum, karar tarihi)
   */
  async execute(refundId: string, actorId: string | undefined) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    const refund = await this.refundRepo.findById(refundId);
    if (!refund) throw new AppError('REFUND_NOT_FOUND', 'Refund request not found', 404);
    // Admin yalnızca educator'ın onayladığı, aday itiraz ettiği veya süresi dolmuş talepleri onaylayabilir
    const adminApprovableStatuses = ['EDUCATOR_APPROVED', 'APPEAL_PENDING', 'ESCALATED'];
    if (!adminApprovableStatuses.includes(refund.status)) {
      throw new AppError('REFUND_NOT_ACTIONABLE', 'Refund is not in a state that admin can approve', 409);
    }

    const now = new Date();
    const updated = await this.refundRepo.approve(refundId, actorId, now);

    // Ödeme iadesi işlemini (ödeme sağlayıcısına geri ödeme vb.) tetikle
    await this.processor.process(updated);

    // Audit log repository'nin kendi transaction'ı içinde yazılıyor — burada tekrar çağrılmaz.

    // decidedAt alanı string veya Date tipinde gelebilir; tutarlı ISO formatına çevir
    const decidedAtStr = typeof updated.decidedAt === 'string' ? updated.decidedAt : (updated.decidedAt ? new Date(updated.decidedAt).toISOString() : now.toISOString());
    return { id: updated.id, status: updated.status, decidedAt: decidedAtStr };
  }
}
