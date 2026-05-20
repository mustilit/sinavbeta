// @ts-nocheck
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
    let enqueued = 0;
    for (const [userId, attempts] of byUser.entries()) {
      // E-posta tercihi kapalı olan kullanıcılar atlanır
      const pref = await this.prefRepo.findByUserId(userId);
      if (!pref || !pref.emailEnabled) continue;
      await this.queueService.enqueueEmail({ to: userId, subject: 'Reminder: unfinished tests', body: `You have ${attempts.length} unfinished attempts.`, meta: { type: 'INACTIVE_REMINDER' } });
      enqueued++;
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

