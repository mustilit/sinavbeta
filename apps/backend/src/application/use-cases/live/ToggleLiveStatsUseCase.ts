import { ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { invalidateLiveStateCache } from './GetLiveSessionStateUseCase';

export class ToggleLiveStatsUseCase {
  async execute(sessionId: string, educatorId: string) {
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Live session not found', 404);
    if (session.educatorId !== educatorId)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your session' });
    const updated = await prisma.liveSession.update({ where: { id: sessionId }, data: { showStats: !session.showStats } });
    await invalidateLiveStateCache(sessionId);
    return updated;
  }
}
