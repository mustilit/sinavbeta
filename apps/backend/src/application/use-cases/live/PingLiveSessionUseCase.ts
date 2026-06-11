import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { LiveActor, resolveLiveParticipant } from './resolveLiveParticipant';

export class PingLiveSessionUseCase {
  async execute(sessionId: string, actor: LiveActor) {
    const participant = await resolveLiveParticipant(sessionId, actor);
    if (!participant) throw new AppError('NOT_JOINED', 'Not a participant', 404);
    await prisma.liveParticipant.update({ where: { id: participant.id }, data: { lastSeenAt: new Date() } });
    return { ok: true };
  }
}
