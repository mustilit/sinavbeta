// @ts-nocheck
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { IAttemptRepository } from '../../../domain/interfaces/IAttemptRepository';
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { IAttemptAnswerRepository } from '../../../domain/interfaces/IAttemptAnswerRepository';
import { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';

/**
 * Süreli testlerde süre dolunca denemeyi otomatik olarak TIMEOUT durumuna alır.
 * Skoru hesaplar ve kaydeder. İdempotent: zaten bitmiş denemeye tekrar uygulanabilir.
 */
export class TimeoutAttemptUseCase {
  constructor(
    private readonly attempts: IAttemptRepository,
    private readonly exams: IExamRepository,
    private readonly answers: IAttemptAnswerRepository,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(attemptId: string, candidateId: string) {
    if (!attemptId || !candidateId) throw new BadRequestException('INVALID_INPUT');

    const attempt = await this.attempts.findAttemptById(attemptId);
    if (!attempt) throw new BadRequestException({ code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });
    if (attempt.candidateId !== candidateId) throw new ForbiddenException({ code: 'NOT_ATTEMPT_OWNER', message: 'Not owner' });

    // Zaten sonuçlanmış deneme — idempotent, ikinci kez işlem yapma
    if ((attempt as any).status === 'TIMEOUT' || (attempt as any).status === 'SUBMITTED') {
      return attempt;
    }

    const test = await this.exams.findById(attempt.testId);
    if (!test) throw new BadRequestException({ code: 'TEST_NOT_FOUND', message: 'Test not found' });
    if (!test.isTimed || !test.duration) throw new BadRequestException({ code: 'TEST_NOT_TIMED', message: 'Test is not timed' });

    const rows = await this.answers.findByAttemptIdWithOptionCorrectness(attemptId);
    const answeredCount = rows.filter((r) => r.selectedOptionId != null).length;
    const correct = rows.filter((r) => r.isCorrect === true).length;
    const totalQuestions = test.questionCount ?? (test.questions ? test.questions.length : 0);
    const wrong = answeredCount - correct;
    const blank = Math.max(0, totalQuestions - answeredCount);
    const score = correct;

    const now = new Date();
    const updated = await this.attempts.markTimeout(attemptId, { score, submittedAt: now, completedAt: now });

    try {
      if (this.audit) {
        await this.audit.create({
          action: 'SUBMIT_ATTEMPT',
          entityType: 'TestAttempt',
          entityId: attemptId,
          actorId: candidateId,
          metadata: { reason: 'TIMEOUT', correct, wrong, blank, score },
        });
      }
    } catch {}

    return { correct, wrong, blank, score, updated };
  }
}

