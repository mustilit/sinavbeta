import { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Admin tarafından bekleyen bir iade talebini çözüme kavuşturur.
 * - Karar: APPROVED (onaylandı) veya REJECTED (reddedildi).
 * - Onaylanan iadelerde adaya bildirim e-postası kuyruğa eklenir (mock).
 * - Audit log best-effort olarak yazılır.
 */
export class ResolveRefundRequestUseCase {
  constructor(private readonly refundRepo: IRefundRepository, private readonly auditRepo: IAuditLogRepository, private readonly queueService?: any) {}

  /**
   * İade talebini onaylar veya reddeder.
   * @param refundId - Çözüme kavuşturulacak iade talebinin ID'si.
   * @param decision - Karar: 'APPROVED' veya 'REJECTED'.
   * @param adminId  - Kararı veren admin kullanıcısının ID'si.
   */
  async execute(refundId: string, decision: 'APPROVED' | 'REJECTED', adminId: string) {
    if (!refundId || !decision || !adminId) throw new BadRequestException('INVALID_INPUT');
    const refund = await this.refundRepo.findById(refundId);
    if (!refund) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Refund not found' });
    // Daha önce çözüme kavuşturulmuş talepler tekrar işlenemez
    if (refund.status !== 'PENDING') throw new BadRequestException({ code: 'ALREADY_RESOLVED', message: 'Refund already resolved' });

    const updated = await this.refundRepo.updateStatus(refundId, decision, adminId);

    // Audit kaydı başarısız olsa da işlem devam eder
    try {
      await this.auditRepo.create({ action: decision === 'APPROVED' ? 'REFUND_APPROVED' as any : 'REFUND_REJECTED' as any, entityType: 'RefundRequest', entityId: refundId, actorId: adminId, metadata: { decision } });
    } catch {}

    // Onaylanan iade → adaya bildirim e-postası ADMIN sağlayıcısı üzerinden gönderilir
    // (EmailService → dispatcher/kill-switch → kuyruk → DB'deki aktif provider).
    // Legacy queueService.enqueueEmail (MockEmailProvider) KULLANILMAZ — gerçekte
    // iletmiyordu. Best-effort: e-posta hatası iade akışını ASLA bozmaz.
    if (decision === 'APPROVED') {
      try {
        const { prisma } = require('../../../infrastructure/database/prisma');
        const { getEmailService } = require('../../services/email/EmailService');
        const candidate = await prisma.user.findUnique({
          where: { id: updated.candidateId },
          select: { email: true, username: true, tenantId: true, role: true },
        });
        if (candidate?.email) {
          const purchase = await prisma.purchase.findUnique({
            where: { id: updated.purchaseId },
            select: { amountCents: true, currency: true, packageId: true },
          });
          let packageTitle = 'Paket';
          if (purchase?.packageId) {
            const pkg = await prisma.testPackage.findUnique({ where: { id: purchase.packageId }, select: { title: true } });
            packageTitle = pkg?.title ?? packageTitle;
          }
          await getEmailService().send({
            tenantId: candidate.tenantId,
            templateKey: 'refund-confirmation',
            to: { userId: updated.candidateId, email: candidate.email, role: candidate.role },
            data: {
              user: { username: candidate.username },
              package: { title: packageTitle },
              amount: purchase ? `${((purchase.amountCents ?? 0) / 100).toFixed(2)} ${purchase.currency ?? 'TRY'}` : '',
              purchaseId: updated.purchaseId,
            },
            bypassPreferences: true, // CRITICAL — iade onayı kullanıcı tercihinden bağımsız
          });
        }
      } catch {
        // best-effort — iade tamamlandı; e-posta gönderilemese de akış sürer
      }
    }

    return updated;
  }
}

