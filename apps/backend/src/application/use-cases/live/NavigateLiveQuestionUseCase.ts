import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { invalidateLiveStateCache } from './GetLiveSessionStateUseCase';

export class NavigateLiveQuestionUseCase {
  async execute(sessionId: string, educatorId: string, direction: 'next' | 'prev') {
    const session = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { questions: true } } },
    });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Live session not found', 404);
    if (session.educatorId !== educatorId)
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your session' });
    // ACTIVE veya ENDED durumda navigasyon serbest:
    // - ACTIVE: canlı sınavda eğitici soruları ilerletir
    // - ENDED: eğitici gözden geçirme yapabilsin (status değişmez, adaylar zaten katılamaz)
    if (session.status !== 'ACTIVE' && session.status !== 'ENDED')
      throw new BadRequestException({ code: 'SESSION_NOT_NAVIGABLE', message: 'Session is not navigable' });
    const total = session._count.questions;
    let nextIdx = session.currentQuestionIdx + (direction === 'next' ? 1 : -1);
    nextIdx = Math.max(0, Math.min(total - 1, nextIdx));
    const navigated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        currentQuestionIdx: nextIdx,
        // ACTIVE'de yeni soruya geçince istatistik gizlenir; ENDED'da gözden geçirme
        // sırasında kullanıcının istatistik tercihi değişmesin (otomatik gizleme yok)
        ...(session.status === 'ACTIVE' ? { showStats: false } : {}),
      },
    });
    await invalidateLiveStateCache(sessionId);
    return navigated;
  }
}
