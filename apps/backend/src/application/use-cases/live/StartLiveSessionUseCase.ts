import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { invalidateLiveStateCache } from './GetLiveSessionStateUseCase';

/**
 * Canlı oturumu DRAFT → ACTIVE'ye geçirir.
 *
 * Tek aktif oturum kuralı: Bir eğitici aynı anda yalnızca bir ACTIVE oturum
 * çalıştırabilir. Round 1 veya Round 2 farketmez — başka ACTIVE oturum varsa
 * yeni oturum başlatılamaz. Aksi takdirde aynı eğitici iki ayrı joinCode'la
 * iki paralel canlı sınav yürütürse katılımcılar ve istatistikler karışır.
 */
export class StartLiveSessionUseCase {
  async execute(sessionId: string, educatorId: string) {
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Live session not found', 404);
    if (session.educatorId !== educatorId)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your session' });
    if (session.status === 'ACTIVE')
      throw new BadRequestException({ code: 'ALREADY_ACTIVE', message: 'Session is already active' });
    if (session.status === 'ENDED')
      throw new BadRequestException({ code: 'SESSION_ENDED', message: 'Session has ended' });
    if (!session.paidAt)
      throw new BadRequestException({ code: 'NOT_PAID', message: 'Payment required before starting' });

    // Tek aktif oturum kontrolü — başka ACTIVE oturum varsa engelle
    const otherActive = await prisma.liveSession.findFirst({
      where: {
        educatorId,
        status: 'ACTIVE',
        id: { not: sessionId },
      },
      select: { id: true, title: true, joinCode: true, roundNumber: true },
    });
    if (otherActive) {
      throw new BadRequestException({
        code: 'EDUCATOR_HAS_ACTIVE_SESSION',
        message: `Zaten aktif bir canlı oturumunuz var: "${otherActive.title}" (Kod: ${otherActive.joinCode}). Yeni oturum başlatmadan önce mevcut oturumu sonlandırın.`,
        activeSessionId: otherActive.id,
        activeSessionTitle: otherActive.title,
        activeSessionJoinCode: otherActive.joinCode,
        activeSessionRoundNumber: otherActive.roundNumber,
      });
    }

    const started = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { status: 'ACTIVE', startedAt: new Date(), currentQuestionIdx: 0 },
    });
    await invalidateLiveStateCache(sessionId);
    return started;
  }
}
