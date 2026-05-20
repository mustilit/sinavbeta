// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

export class ListMyLiveSessionsUseCase {
  async execute(educatorId: string) {
    if (!educatorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    return prisma.liveSession.findMany({
      where: { educatorId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { questions: true, participants: true } } },
    });
  }
}
