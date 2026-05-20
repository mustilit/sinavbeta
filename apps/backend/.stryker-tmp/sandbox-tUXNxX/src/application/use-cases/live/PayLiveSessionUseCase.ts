// @ts-nocheck
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

export class PayLiveSessionUseCase {
  async execute(sessionId: string, educatorId: string) {
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Live session not found', 404);
    if (session.educatorId !== educatorId)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your session' });
    if (session.paidAt)
      throw new BadRequestException({ code: 'ALREADY_PAID', message: 'Session is already paid' });
    if (session.status === 'ENDED')
      throw new BadRequestException({ code: 'SESSION_ENDED', message: 'Session has ended' });
    return prisma.liveSession.update({ where: { id: sessionId }, data: { paidAt: new Date() } });
  }
}
