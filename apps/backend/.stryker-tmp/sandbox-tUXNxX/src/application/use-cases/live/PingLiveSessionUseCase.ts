// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

export class PingLiveSessionUseCase {
  async execute(sessionId: string, userId: string) {
    const participant = await prisma.liveParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!participant) throw new AppError('NOT_JOINED', 'Not a participant', 404);
    await prisma.liveParticipant.update({ where: { id: participant.id }, data: { lastSeenAt: new Date() } });
    return { ok: true };
  }
}
