import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { IAttemptRepository } from '../../../domain/interfaces/IAttemptRepository';
import { AppError } from '../../errors/AppError';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';
import { prisma } from '../../../infrastructure/database/prisma';
import { logger } from '../../../infrastructure/logger/logger';
import { ModerateQuestionContentUseCase } from '../moderation/ModerateQuestionContentUseCase';

/**
 * Soru ve şık güncelleme.
 * Eğitici her zaman güncelleyebilir; önceden attempt başlatmış adaylar
 * questionsSnapshot sayesinde orijinal versiyonu görmeye devam eder.
 */
export class UpdateQuestionUseCase {
  constructor(
    private readonly examRepository: IExamRepository,
    private readonly userRepository: IUserRepository,
    private readonly attemptRepository: IAttemptRepository,
    private readonly moderateQuestionContent?: ModerateQuestionContentUseCase,
  ) {}

  async execute(
    questionId: string,
    updates: { content?: string; order?: number; mediaUrl?: string | null; solutionText?: string | null; solutionMediaUrl?: string | null },
    actorId?: string,
  ) {
    if (actorId) {
      const user = await this.userRepository.findById(actorId);
      if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
      ensureEducatorActive(user);
    }

    const question = await this.examRepository.findQuestionById(questionId);
    if (!question) throw new AppError('QUESTION_NOT_FOUND', 'Question not found', 404);

    const test = await this.examRepository.findById(question.testId);
    if (!test) throw new AppError('TEST_NOT_FOUND', 'Test not found', 404);

    if (actorId && test.educatorId && test.educatorId !== actorId) {
      throw new AppError('FORBIDDEN_NOT_OWNER', 'Only the educator who owns the test can update it', 403);
    }

    const updated = await this.examRepository.updateQuestion(questionId, updates);

    // Post-write hook: best-effort moderasyon — içerik değiştiyse yeniden modere et
    if (updates.content && this.moderateQuestionContent) {
      const moderateUC = this.moderateQuestionContent;
      setImmediate(async () => {
        try {
          const q = await prisma.examQuestion.findUnique({
            where: { id: questionId },
            select: { testId: true, content: true, mediaUrl: true },
          });
          if (!q) return;

          const dbTest = await prisma.examTest.findUnique({
            where: { id: q.testId },
            select: { educatorId: true, tenantId: true },
          });
          if (!dbTest?.educatorId || !dbTest?.tenantId) return;

          await moderateUC.execute({
            questionId,
            educatorId: dbTest.educatorId,
            tenantId: dbTest.tenantId,
            text: updates.content ?? q.content,
            imageUrl: updates.mediaUrl ?? q.mediaUrl ?? null,
          });
        } catch (err: any) {
          logger.warn('[UpdateQuestion] Moderasyon hook başarısız (best-effort)', {
            error: err?.message,
            questionId,
          });
        }
      });
    }

    return updated;
  }
}
