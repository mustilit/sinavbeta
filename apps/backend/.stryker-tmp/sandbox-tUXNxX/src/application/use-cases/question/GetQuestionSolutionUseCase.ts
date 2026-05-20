// @ts-nocheck
import { IAttemptRepository } from '../../../domain/interfaces/IAttemptRepository';
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';

/**
 * Test tamamlandıktan sonra belirli bir sorunun çözümünü döner.
 *
 * İş kuralları:
 *   - Deneme tamamlanmış olmalı (SUBMITTED veya TIMEOUT)
 *   - Test için çözüm özelliği aktif olmalı (hasSolutions=true)
 *   - Sadece denemenin sahibi erişebilir
 */
export class GetQuestionSolutionUseCase {
  constructor(private readonly attemptRepo: IAttemptRepository, private readonly examRepo: IExamRepository) {}

  async execute(attemptId: string, questionId: string, candidateId: string) {
    if (!attemptId || !questionId || !candidateId) throw new BadRequestException('INVALID_INPUT');

    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) throw new BadRequestException({ code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });
    if (attempt.candidateId !== candidateId) throw new ForbiddenException({ code: 'NOT_ATTEMPT_OWNER', message: 'Not owner' });
    // Devam eden denemede çözüm gösterilemez — hile engeli
    if (attempt.status === 'IN_PROGRESS') throw new ConflictException({ code: 'ATTEMPT_NOT_FINISHED', message: 'Attempt not finished' });
    // Tamamlanmış durum olarak SUBMITTED ve TIMEOUT kabul edilir
    if (!['SUBMITTED', 'TIMEOUT'].includes(attempt.status as any)) throw new BadRequestException({ code: 'ATTEMPT_INVALID_STATUS', message: 'Attempt in invalid status' });

    const test = await this.examRepo.findById(attempt.testId);
    if (!test) throw new BadRequestException({ code: 'TEST_NOT_FOUND', message: 'Test not found' });
    // Eğitici çözüm eklememişse veya pasife almışsa erişim engellenir
    const hasSolutions = (test as { hasSolutions?: boolean }).hasSolutions ?? false;
    if (!hasSolutions) throw new BadRequestException({ code: 'SOLUTIONS_DISABLED', message: 'Solutions not enabled for this test' });

    // find question in test.questions
    const q = test.questions.find((x: any) => x.id === questionId);
    if (!q) throw new BadRequestException({ code: 'QUESTION_NOT_IN_TEST', message: 'Question does not belong to test' });

    return { questionId, solutionText: (q as any).solutionText ?? null, solutionMediaUrl: (q as any).solutionMediaUrl ?? null };
  }
}

