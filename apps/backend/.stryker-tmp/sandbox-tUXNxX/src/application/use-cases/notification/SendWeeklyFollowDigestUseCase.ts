// @ts-nocheck
import { IFollowRepository } from '../../../domain/interfaces/IFollowRepository';
import { INotificationPreferenceRepository } from '../../../domain/interfaces/INotificationPreferenceRepository';
import { prisma } from '../../../infrastructure/database/prisma';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { QueueService } from '../../../infrastructure/queue/queue.service';

/**
 * Haftalık takip özeti e-postasını kuyruğa ekler.
 * Son 7 günde yayınlanan testleri takip eden kullanıcılara digest gönderilir.
 * - Eğitici takipçileri: ilgili eğiticinin yeni testlerinden haberdar edilir.
 * - Sınav türü takipçileri: ilgili sınav türündeki yeni testlerden haberdar edilir.
 * - E-posta tercihi kapalı olanlar atlanır.
 */
export class SendWeeklyFollowDigestUseCase {
  constructor(
    private readonly followRepo: IFollowRepository,
    private readonly prefRepo: INotificationPreferenceRepository,
    private readonly queueService: QueueService,
    private readonly auditRepo: PrismaAuditLogRepository
  ) {}

  /**
   * Haftalık özet e-postalarını kuyruğa ekler.
   * @returns Kuyruğa eklenen e-posta sayısı.
   */
  async execute() {
    // Son 7 günde yayınlanan testler sorgulanır
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const tests = await prisma.examTest.findMany({ where: { publishedAt: { gte: since } }, select: { id: true, title: true, educatorId: true, examTypeId: true } });
    if (!tests.length) return { enqueued: 0 };

    // Testler eğitici ve sınav türüne göre gruplandırılır
    const byEducator = new Map<string, any[]>();
    const byExamType = new Map<string, any[]>();
    for (const t of tests) {
      if (t.educatorId) {
        byEducator.set(t.educatorId, (byEducator.get(t.educatorId) ?? []).concat(t));
      }
      if (t.examTypeId) {
        byExamType.set(t.examTypeId, (byExamType.get(t.examTypeId) ?? []).concat(t));
      }
    }

    // Tüm alıcılar Set'te toplanır — aynı kişi birden fazla kaynaktan tetiklenirse tekrar gönderilmez
    const recipients = new Set<string>();
    for (const [educatorId] of byEducator.entries()) {
      const followers = await this.followRepo.listFollowersForEducator(educatorId);
      for (const u of followers) recipients.add(u);
    }
    for (const [examTypeId] of byExamType.entries()) {
      const followers = await this.followRepo.listFollowersForExamType(examTypeId);
      for (const u of followers) recipients.add(u);
    }

    let enqueued = 0;
    for (const userId of recipients) {
      // E-posta tercihi kapalı olan kullanıcılar atlanır
      const pref = await this.prefRepo.findByUserId(userId);
      if (!pref || !pref.emailEnabled) continue;
      await this.queueService.enqueueEmail({ to: userId, subject: 'Weekly digest', body: `New tests published: ${tests.length}`, meta: { type: 'WEEKLY_DIGEST' } });
      enqueued++;
    }

    // Toplu gönderim sonucu audit log'a yazılır
    await this.auditRepo.create({
      action: 'EMAIL_SENT',
      entityType: 'Digest',
      entityId: 'weekly_follow',
      actorId: null,
      metadata: { count: enqueued },
    } as any);

    return { enqueued };
  }
}

