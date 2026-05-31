import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';

/**
 * Aynı cihaz/IP'den bir oturuma izin verilen maksimum katılım. "Kapatma
 * saldırısı" korumasını sağlar: tek bir cihaz çok sayıda sahte hesapla tüm
 * kotayı dolduramaz. Meşru paylaşımlı IP (ev/okul) için makul üst sınır.
 */
const MAX_JOINS_PER_IP = 3;

export class JoinLiveSessionUseCase {
  /**
   * @param ctx.ip — istek IP'si (controller'dan). Kapatma saldırısı limiti için.
   */
  async execute(joinCode: string, userId: string, ctx?: { ip?: string | null }) {
    const session = await prisma.liveSession.findUnique({ where: { joinCode: joinCode.toUpperCase() } });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Session not found — check the code', 404);
    if (session.status === 'ENDED')
      throw new BadRequestException({ code: 'SESSION_ENDED', message: 'Bu oturum sona erdi' });
    // NOT: DRAFT artık REDDEDİLMEZ — aday beklemeye alınır (frontend "test henüz
    // başlatılmadı" bekleme ekranı gösterir, status ACTIVE olunca otomatik girer).
    // Yalnızca ENDED reddedilir.

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.status !== 'ACTIVE')
      throw new ForbiddenException({ code: 'USER_NOT_ACTIVE', message: 'Hesabınız aktif değil' });

    if (session.roundNumber === 2 && session.parentSessionId) {
      const wasInRound1 = await prisma.liveParticipant.findUnique({
        where: { sessionId_userId: { sessionId: session.parentSessionId, userId } },
      });
      if (!wasInRound1)
        throw new ForbiddenException({ code: 'NOT_IN_ROUND1', message: '1. tura katılmış olmanız gerekiyor' });
    }

    // Mevcut katılımcı kontrolü — zaten kayıtlı ise kapasite/IP limiti değişmez
    const existing = await prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId } },
    });

    const ip = ctx?.ip?.trim() || null;

    if (!existing) {
      // ── Kapatma saldırısı koruması: aynı IP'den katılım limiti ──
      // Sadece yeni katılımda + IP biliniyorsa. Bu kullanıcının kendi kaydı
      // henüz yok; aynı IP'den FARKLI kullanıcıların sayısına bakılır.
      if (ip) {
        const rows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
          SELECT COUNT(*)::bigint AS cnt
          FROM live_participants
          WHERE "sessionId" = ${session.id} AND join_ip = ${ip}
        `;
        const sameIpCount = Number(rows[0]?.cnt ?? 0);
        if (sameIpCount >= MAX_JOINS_PER_IP) {
          // Kapatma saldırısı tespiti → forensic/abuse izi. Best-effort:
          // audit yazımı asıl reddi (ve client yanıtını) asla maskelemez.
          // SUSPICIOUS_RATE_LIMIT ile aynı sınıf güvenlik olayı.
          await this.logQuotaExceeded(userId, session.id, session.joinCode, ip, sameIpCount);
          throw new ForbiddenException({
            code: 'DEVICE_QUOTA_EXCEEDED',
            message: `Bu cihazdan bu oturuma en fazla ${MAX_JOINS_PER_IP} katılım yapılabilir.`,
          });
        }
      }

      // ── Kapasite kontrolü (atomik) ──
      if (session.maxParticipants != null) {
        const updated = await prisma.liveSession.updateMany({
          where: {
            id: session.id,
            currentParticipantCount: { lt: session.maxParticipants },
          },
          data: { currentParticipantCount: { increment: 1 } },
        });
        if (updated.count === 0) {
          throw new BadRequestException({ code: 'SESSION_FULL', message: `Kapasite doldu (${session.maxParticipants})` });
        }
      } else {
        await prisma.liveSession.update({
          where: { id: session.id },
          data: { currentParticipantCount: { increment: 1 } },
        });
      }
    }

    // Katılımcı kaydı — upsert ile idempotent
    const participant = await prisma.liveParticipant.upsert({
      where: { sessionId_userId: { sessionId: session.id, userId } },
      create: { sessionId: session.id, userId },
      update: {},
    });

    // join_ip'i kaydet — Prisma client kolonu görmüyor (EPERM regenerate engeli),
    // yeni katılımda raw SQL ile set et (idempotent; mevcut katılımda dokunmaz).
    if (!existing && ip) {
      await prisma.$executeRaw`
        UPDATE live_participants SET join_ip = ${ip} WHERE id = ${participant.id}
      `;
    }

    return { sessionId: session.id, participantId: participant.id, session };
  }

  /**
   * Kapatma saldırısı kotası aşıldığında audit log yazar (best-effort).
   * Hata yutulur — loglama başarısız olsa bile katılım reddi etkilenmez.
   * Admin DLQ "errors" görünümünde (admin/dlq?action=DEVICE_QUOTA_EXCEEDED) izlenebilir.
   */
  private async logQuotaExceeded(
    userId: string,
    sessionId: string,
    joinCode: string,
    ip: string | null,
    sameIpCount: number,
  ): Promise<void> {
    try {
      const auditRepo = new PrismaAuditLogRepository();
      await auditRepo
        .create({
          action: 'DEVICE_QUOTA_EXCEEDED',
          entityType: 'LiveSession',
          entityId: sessionId,
          actorId: userId,
          metadata: { ip, joinCode, sameIpCount, max: MAX_JOINS_PER_IP },
        })
        .catch(() => {
          // audit hatasını yut — asıl akışı maskeleme
        });
    } catch {
      // ignore audit errors
    }
  }
}
