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

    // Digest şablonu için yeni testler (eğitici adıyla). Legacy queueService.enqueueEmail
    // (MockEmailProvider) yerine ADMIN sağlayıcısı: EmailService → DB provider.
    const educatorIds = Array.from(new Set(tests.map((t) => t.educatorId).filter(Boolean))) as string[];
    const educators = educatorIds.length
      ? await prisma.user.findMany({ where: { id: { in: educatorIds } }, select: { id: true, username: true } })
      : [];
    const educatorName = new Map(educators.map((e) => [e.id, e.username]));
    const newPackages = tests.map((t) => ({ title: t.title, educator: educatorName.get(t.educatorId ?? '') ?? '' }));

    // Alıcıların e-posta/tenant bilgisi (tek sorgu)
    const recipientUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(recipients) } },
      select: { id: true, email: true, username: true, tenantId: true, role: true },
    });
    const userById = new Map(recipientUsers.map((u) => [u.id, u]));

    const { getEmailService } = require('../../services/email/EmailService');
    const emailService = getEmailService();

    let enqueued = 0;
    for (const userId of recipients) {
      // Bildirim tercihi kapalı olanlar atlanır. (BULK kuyruğu EmailDispatcher'da ayrıca
      // emailPreferences.weeklyDigest tercihini de kontrol eder; bypass EDİLMEZ.)
      const pref = await this.prefRepo.findByUserId(userId);
      if (!pref || !pref.emailEnabled) continue;
      const u = userById.get(userId);
      if (!u?.email) continue;
      try {
        await emailService.send({
          tenantId: u.tenantId,
          templateKey: 'weekly-digest',
          to: { userId: u.id, email: u.email, role: u.role },
          data: { user: { username: u.username }, newPackages, campaigns: [] },
        });
        enqueued++;
      } catch {
        // best-effort — tek kullanıcıdaki hata digest döngüsünü durdurmaz
      }
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

