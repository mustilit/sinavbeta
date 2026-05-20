// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

export class GetLiveSessionByCodeUseCase {
  async execute(code: string) {
    const session = await prisma.liveSession.findUnique({
      where: { joinCode: code.toUpperCase() },
      select: {
        id: true,
        title: true,
        status: true,
        joinCode: true,
        maxParticipants: true,
        roundNumber: true,
        educator: { select: { id: true, username: true } },
        _count: { select: { questions: true, participants: true } },
      },
    });
    if (!session) {
      throw new AppError('SESSION_NOT_FOUND', 'Oturum bulunamadı', 404);
    }
    return session;
  }
}
