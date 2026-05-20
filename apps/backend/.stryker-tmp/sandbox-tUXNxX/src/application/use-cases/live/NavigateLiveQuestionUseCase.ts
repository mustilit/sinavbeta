// @ts-nocheck
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

export class NavigateLiveQuestionUseCase {
  async execute(sessionId: string, educatorId: string, direction: 'next' | 'prev') {
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { questions: true } } },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Live session not found', 404);
    if (session.educatorId !== educatorId)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your session' });
    if (session.status !== 'ACTIVE')
      throw new BadRequestException({ code: 'SESSION_NOT_ACTIVE', message: 'Session is not active' });
    const total = session._count.questions;
    let nextIdx = session.currentQuestionIdx + (direction === 'next' ? 1 : -1);
    nextIdx = Math.max(0, Math.min(total - 1, nextIdx));
    return prisma.liveSession.update({
      where: { id: sessionId },
      data: { currentQuestionIdx: nextIdx, showStats: false },
    });
  }
}
