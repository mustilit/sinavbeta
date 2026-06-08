import { INotificationPreferenceRepository } from '../../../domain/interfaces/INotificationPreferenceRepository';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { QueueService } from '../../../infrastructure/queue/queue.service';

/**
 * Aylık pasif kullanıcı hatırlatma e-postasını kuyruğa ekler.
 * Son 30 gün içinde giriş yapmamış ve açık denemesi olan kullanıcılara
 * e-posta bildirimi gönderilir. E-posta tercihi kapalı olanlar atlanır.
 */
export class SendMonthlyInactiveReminderUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly prefRepo: INotificationPreferenceRepository,
    private readonly queueService: QueueService,
    private readonly auditRepo: PrismaAuditLogRepository
  ) {}

  /**
   * Pasif kullanıcıları tespit eder ve hatırlatma e-postalarını kuyruğa ekler.
   * @returns Kuyruğa eklenen e-posta sayısı.
   */
  async execute() {
    // Son 30 gündür aktif olmayan, açık denemesi olan kullanıcılar sorgulanır
    const rows = await this.userRepo.listInactiveUsersWithOpenAttempts(30);
    // Aynı kullanıcının birden fazla denemesi olabilir — kullanıcı bazında gruplanır
    const byUser = new Map<string, string[]>();
    for (const r of rows) {
      byUser.set(r.userId, (byUser.get(r.userId) ?? []).concat(r.attemptId));
    }
    // Alıcıların e-posta/tenant bilgisi (tek sorgu). Legacy queueService.enqueueEmail
    // (MockEmailProvider) yerine ADMIN sağlayıcısı: EmailService → DB provider.
    const { prisma } = require('../../../infrastructure/database/prisma');
    const { getEmailService } = require('../../services/email/EmailService');
    const userIds = Array.from(byUser.keys());
    const recipientUsers = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, username: true, tenantId: true, role: true } })
      : [];
    const userById = new Map<string, any>(recipientUsers.map((u: any) => [u.id, u]));
    const emailService = getEmailService();
    const appBaseUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || '';

    let enqueued = 0;
    for (const [userId, attempts] of byUser.entries()) {
      // Bildirim tercihi kapalı olanlar atlanır (NOTIFY kuyruğu EmailDispatcher'da
      // ayrıca emailPreferences.productUpdates tercihini de kontrol eder).
      const pref = await this.prefRepo.findByUserId(userId);
      if (!pref || !pref.emailEnabled) continue;
      const u = userById.get(userId);
      if (!u?.email) continue;
      try {
        await emailService.send({
          tenantId: u.tenantId,
          templateKey: 'inactive-reminder',
          to: { userId: u.id, email: u.email, role: u.role },
          data: { user: { username: u.username }, attemptCount: attempts.length, url: appBaseUrl ? `${appBaseUrl}/MyTests` : '' },
        });
        enqueued++;
      } catch {
        // best-effort — tek kullanıcıdaki hata döngüyü durdurmaz
      }
    }

    // Toplu gönderim sonucu audit log'a yazılır
    await this.auditRepo.create({
      action: 'EMAIL_SENT',
      entityType: 'Reminder',
      entityId: 'monthly_inactive',
      actorId: null,
      metadata: { count: enqueued },
    } as any);
    return { enqueued };
  }
}

