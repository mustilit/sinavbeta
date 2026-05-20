// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/** Eğitici kendi testine ait soruyu siler.
 *  Cevaplanmış sorular silinemez — aday skorları korunur.
 */
export class DeleteQuestionUseCase {
  async execute(testId: string, questionId: string, actorId: string): Promise<void> {
    const question = await prisma.examQuestion.findUnique({
      where: { id: questionId },
      select: {
        testId: true,
        test: { select: { educatorId: true } },
      },
    });

    if (!question || question.testId !== testId) {
      throw new AppError('NOT_FOUND', 'Soru bulunamadı', 404);
    }

    if (question.test.educatorId !== actorId) {
      throw new AppError('FORBIDDEN', 'Bu soruyu silme yetkiniz yok', 403);
    }

    // Cevaplanmış soruyu silmek aday skorlarını bozar (AttemptAnswer cascade delete).
    const hasAnswers = await prisma.attemptAnswer.count({
      where: { questionId },
    });
    if (hasAnswers > 0) {
      throw new AppError(
        'QUESTION_HAS_ATTEMPTS',
        'Bu soru en az bir aday tarafından cevaplanmış; silinemez.',
        409,
      );
    }

    await prisma.examQuestion.delete({ where: { id: questionId } });
  }
}
