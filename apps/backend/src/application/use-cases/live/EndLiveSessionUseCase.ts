import { ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { invalidateLiveStateCache } from './GetLiveSessionStateUseCase';

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Canlı oturumu sonlandırır.
 *
 * Round 1 ENDED olduğunda (Round 2 henüz yoksa) Round 2'yi DRAFT olarak otomatik
 * oluşturur. Böylece eğitici MyLiveSessions sayfasına döndüğünde Round 2'nin
 * joinCode'u hazır olur ve kart üzerinde gösterilir. Eğitici sadece "2. Oturumu
 * Başlat" butonuyla DRAFT → ACTIVE geçişi yapar.
 *
 * Round 2'yi otomatik oluşturmazsak kullanıcı geri döndüğünde kod görmez —
 * mevcut UX bunu garip buluyor (Round 2'nin var olduğunu varsayıyor).
 */
export class EndLiveSessionUseCase {
  async execute(sessionId: string, educatorId: string) {
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { questions: { include: { options: true } } },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Live session not found', 404);
    if (session.educatorId !== educatorId)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your session' });

    const ended = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: 'ENDED', endedAt: new Date(), showStats: true },
    });

    // Round 1 → otomatik Round 2 DRAFT oluştur.
    // Round 2 zaten varsa atla (idempotent). Round 2 sonlandırıldığında Round 3
    // diye bir şey yok, sadece roundNumber === 1 için tetiklenir.
    if (session.roundNumber === 1) {
      const existingRound2 = await prisma.liveSession.findFirst({
        where: { parentSessionId: sessionId, roundNumber: 2 },
      });

      if (!existingRound2) {
        // Unique joinCode bul (collision olasılığı düşük ama yine de kontrol)
        let joinCode = generateJoinCode();
        let attempts = 0;
        while (attempts < 10) {
          const exists = await prisma.liveSession.findUnique({ where: { joinCode } });
          if (!exists) break;
          joinCode = generateJoinCode();
          attempts++;
        }

        await prisma.liveSession.create({
          data: {
            educatorId,
            tierId: session.tierId,
            maxParticipants: session.maxParticipants,
            title: `${session.title} - Tur 2`,
            joinCode,
            status: 'DRAFT',
            roundNumber: 2,
            parentSessionId: session.id,
            // Tur 1 zaten ödendi — Tur 2 aynı içerikle ek ücret almadan başlatılabilsin.
            // StartLiveSessionUseCase paidAt zorunlu kıldığı için burada set.
            paidAt: session.paidAt ?? new Date(),
            questions: {
              create: session.questions.map((q) => ({
                content: q.content,
                mediaUrl: q.mediaUrl,
                order: q.order,
                options: {
                  create: q.options.map((o) => ({
                    content: o.content,
                    mediaUrl: (o as any).mediaUrl ?? null,
                    isCorrect: o.isCorrect,
                    order: o.order,
                  })),
                },
              })),
            },
          },
        });
      }
    }

    await invalidateLiveStateCache(sessionId);
    return ended;
  }
}
