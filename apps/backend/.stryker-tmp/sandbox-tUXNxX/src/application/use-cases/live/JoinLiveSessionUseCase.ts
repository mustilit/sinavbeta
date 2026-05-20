// @ts-nocheck
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

export class JoinLiveSessionUseCase {
  async execute(joinCode: string, userId: string) {
    const session = await prisma.liveSession.findUnique({ where: { joinCode: joinCode.toUpperCase() } });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Session not found — check the code', 404);
    if (session.status === 'ENDED')
      throw new BadRequestException({ code: 'SESSION_ENDED', message: 'Bu oturum sona erdi' });
    if (session.status === 'DRAFT')
      throw new BadRequestException({ code: 'SESSION_NOT_STARTED', message: 'Oturum henüz başlamadı' });

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

    // Mevcut katılımcı kontrolü — zaten kayıtlı ise kapasite değişmez
    const existing = await prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId } },
    });

    if (!existing) {
      if (session.maxParticipants != null) {
        // Atomic kapasite kontrolü — count() + check race condition'ını önler.
        // currentParticipantCount < maxParticipants ise atomik olarak artır; aksi hâlde 0 satır güncellenir.
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
        // Limitsiz oturum — sadece sayacı artır
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
    return { sessionId: session.id, participantId: participant.id, session };
  }
}
