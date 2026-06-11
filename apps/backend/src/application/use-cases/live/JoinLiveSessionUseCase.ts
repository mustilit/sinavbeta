import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { logger } from '../../../infrastructure/logger/logger';

/**
 * Aynı cihaz/IP'den bir oturuma izin verilen maksimum katılım (KAYITLI kullanıcı).
 * "Kapatma saldırısı" koruması: tek cihaz çok sahte hesapla kotayı dolduramaz.
 */
const MAX_JOINS_PER_IP = 3;

/**
 * Misafir (login'siz) katılım için IP başına üst sınır. Sınıf/etkinlikte onlarca
 * öğrenci tek NAT IP'sinden (okul/ev) katılabilir; bu yüzden kayıtlıdan yüksek.
 * Yine de tek IP'nin oturumu tek başına doldurmasını sınırlar (kapasite ayrıca var).
 */
const MAX_GUEST_JOINS_PER_IP = 50;

export class JoinLiveSessionUseCase {
  /**
   * Kayıtlı kullanıcı (actor.userId) VEYA misafir (actor.displayName) katılımı.
   * @param actor.ip — istek IP'si (controller'dan). Kapatma saldırısı limiti için.
   */
  async execute(
    joinCode: string,
    actor: { userId?: string | null; displayName?: string | null; ip?: string | null },
  ) {
    const session = await prisma.liveSession.findUnique({ where: { joinCode: joinCode.toUpperCase() } });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Session not found — check the code', 404);
    if (session.status === 'ENDED')
      throw new BadRequestException({ code: 'SESSION_ENDED', message: 'Bu oturum sona erdi' });
    // NOT: DRAFT reddedilmez — aday beklemeye alınır; status ACTIVE olunca otomatik girer.

    const userId: string | null = actor.userId ?? null;
    const isGuest = !userId;
    let displayName: string | null = null;

    if (isGuest) {
      // Login'siz (misafir) katılım — isim zorunlu.
      const name = (actor.displayName ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (name.length < 2)
        throw new BadRequestException({ code: 'DISPLAY_NAME_REQUIRED', message: 'Lütfen adınızı girin (en az 2 karakter)' });
      displayName = name;
      // 2. tur (round2) misafire kapalı — 1. tur üyeliği doğrulanamaz.
      if (session.roundNumber === 2 && session.parentSessionId)
        throw new ForbiddenException({ code: 'GUEST_NOT_ALLOWED_ROUND2', message: '2. tura katılmak için giriş yapmalısınız' });
    } else {
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
    }

    // Mevcut katılımcı — yalnız kayıtlı kullanıcıda idempotent (misafir her join'de yeni).
    const existing = userId
      ? await prisma.liveParticipant.findUnique({
          where: { sessionId_userId: { sessionId: session.id, userId } },
        })
      : null;

    const ip = actor.ip?.trim() || null;

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
        const ipLimit = isGuest ? MAX_GUEST_JOINS_PER_IP : MAX_JOINS_PER_IP;
        if (sameIpCount >= ipLimit) {
          // Kapatma saldırısı tespiti → forensic/abuse izi. Best-effort:
          // audit yazımı asıl reddi (ve client yanıtını) asla maskelemez.
          // SUSPICIOUS_RATE_LIMIT ile aynı sınıf güvenlik olayı.
          await this.logQuotaExceeded(userId, session.id, session.joinCode, ip, sameIpCount);
          throw new ForbiddenException({
            code: 'DEVICE_QUOTA_EXCEEDED',
            message: `Bu cihazdan bu oturuma en fazla ${ipLimit} katılım yapılabilir.`,
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

    // Katılımcı kaydı.
    let guestToken: string | null = null;
    let participant: { id: string };
    if (userId) {
      // Kayıtlı kullanıcı — upsert ile idempotent.
      participant = await prisma.liveParticipant.upsert({
        where: { sessionId_userId: { sessionId: session.id, userId } },
        create: { sessionId: session.id, userId },
        update: {},
      });
    } else {
      // Misafir — her join yeni kayıt; guestToken sonraki istekleri (state/ping/answer) doğrular.
      guestToken = randomBytes(24).toString('hex');
      participant = await prisma.liveParticipant.create({
        data: { sessionId: session.id, userId: null, displayName, guestToken } as any,
      });
    }

    // join_ip'i kaydet (yeni katılımda; idempotent — mevcut katılımda dokunmaz).
    if (!existing && ip) {
      await prisma.$executeRaw`
        UPDATE live_participants SET join_ip = ${ip} WHERE id = ${participant.id}
      `;
    }

    return {
      sessionId: session.id,
      participantId: participant.id,
      session,
      // Misafir ise kimlik token'ı + ad döndürülür (frontend saklayıp sonraki isteklerde yollar).
      ...(guestToken ? { participantToken: guestToken, displayName } : {}),
    };
  }

  /**
   * Kapatma saldırısı kotası aşıldığında audit log yazar (best-effort).
   * Audit yazımı başarısız olsa bile katılım reddi etkilenmez; ancak hata artık
   * sessizce yutulmaz — `logger.warn('live.device_quota.audit_failed')` ile görünür kılınır.
   * Admin DLQ "errors" görünümünde (admin/dlq?action=DEVICE_QUOTA_EXCEEDED) izlenebilir.
   */
  private async logQuotaExceeded(
    userId: string | null,
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
        .catch((err: any) => {
          // audit yazımı başarısız — asıl reddi maskeleme, ama güvenlik olayını
          // görünür kıl. Sessiz yutma → kötüye kullanım sinyali izsiz kaybolur.
          logger.warn('live.device_quota.audit_failed', {
            error: err?.message,
            userId,
            sessionId,
            joinCode,
            sameIpCount,
          });
        });
    } catch (err: any) {
      // Repository başlatma/beklenmeyen hata — best-effort, ama loglanır.
      logger.warn('live.device_quota.audit_failed', {
        error: err?.message,
        userId,
        sessionId,
      });
    }
  }
}
