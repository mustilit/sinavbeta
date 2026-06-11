import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { LiveActor, resolveLiveParticipant } from './resolveLiveParticipant';

export class SubmitLiveAnswerUseCase {
  async execute(sessionId: string, actor: LiveActor, questionId: string, optionId: string) {
    const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
    if (session.status !== 'ACTIVE')
      throw new BadRequestException({ code: 'SESSION_NOT_ACTIVE', message: 'Session is not active' });

    const question = await prisma.liveQuestion.findUnique({ where: { id: questionId } });
    if (!question || question.sessionId !== sessionId)
      throw new AppError('QUESTION_NOT_FOUND', 'Question not found in this session', 404);
    if (question.order !== session.currentQuestionIdx + 1)
      throw new BadRequestException({ code: 'WRONG_QUESTION', message: 'This is not the current question' });

    const option = await prisma.liveOption.findUnique({ where: { id: optionId } });
    if (!option || option.questionId !== questionId)
      throw new AppError('OPTION_NOT_FOUND', 'Option not found', 404);

    const participant = await resolveLiveParticipant(sessionId, actor);
    if (!participant)
      throw new ForbiddenException({ code: 'NOT_JOINED', message: 'You have not joined this session' });

    return prisma.liveAnswer.upsert({
      where: { questionId_participantId: { questionId, participantId: participant.id } },
      create: { sessionId, questionId, participantId: participant.id, optionId },
      update: { optionId, answeredAt: new Date() },
    });
  }
}
