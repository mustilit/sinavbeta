// @ts-nocheck
import { IAttemptRepository } from '../../../domain/interfaces/IAttemptRepository';
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { IAttemptAnswerRepository } from '../../../domain/interfaces/IAttemptAnswerRepository';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

export class GetAttemptStateUseCase {
  constructor(
    private readonly attemptRepo: IAttemptRepository,
    private readonly examRepo: IExamRepository,
    private readonly answerRepo: IAttemptAnswerRepository,
  ) {}

  async execute(attemptId: string, candidateId: string) {
    if (!attemptId || !candidateId) throw new BadRequestException('INVALID_INPUT');

    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) throw new BadRequestException({ code: 'ATTEMPT_NOT_FOUND', message: 'Attempt not found' });
    if (attempt.candidateId !== candidateId) throw new ForbiddenException({ code: 'NOT_ATTEMPT_OWNER', message: 'Not owner' });

    const test = await this.examRepo.findById(attempt.testId);
    if (!test) throw new BadRequestException({ code: 'TEST_NOT_FOUND', message: 'Test not found' });

    // minimal questions list (id and order). assume examRepo returns ordered questions
    const answers = await this.answerRepo.findByAttemptId(attemptId);
    const answerMap: Record<string, string | null> = {};
    for (const a of answers) answerMap[a.questionId] = a.selectedOptionId ?? null;

    // Snapshot varsa canlı soru listesi yerine onu kullan (eğitici güncellemelerinden bağımsız)
    const questionSource: Array<{ id: string }> =
      (attempt as any).questionsSnapshot ?? test.questions ?? [];

    const questions = questionSource.map((q: any, idx: number) => {
      const selected = answerMap[q.id] ?? null;
      return { id: q.id, index: idx + 1, answered: selected !== null, selectedOptionId: selected };
    });

    const answeredCount = questions.filter((q) => q.answered).length;
    const blankCount = questions.length - answeredCount;

    let durationMinutes: number | undefined = undefined;
    let endsAt: string | undefined = undefined;
    let remainingSeconds: number | undefined = undefined;
    if (test.isTimed && typeof test.duration === 'number') {
      durationMinutes = test.duration;
      const started = new Date(attempt.startedAt).getTime();
      const ends = started + test.duration * 60 * 1000;
      endsAt = new Date(ends).toISOString();
      const now = Date.now();
      remainingSeconds = Math.max(0, Math.floor((ends - now) / 1000));
    }
    let totalSeconds: number | undefined = undefined;
    let isInLast10Percent = false;
    let isInLast3Minutes = false;
    if (typeof durationMinutes === 'number' && durationMinutes > 0) {
      totalSeconds = durationMinutes * 60;
      if (typeof remainingSeconds === 'number') {
        const elapsed = Math.max(0, totalSeconds - remainingSeconds);
        isInLast10Percent = totalSeconds > 0 ? remainingSeconds <= Math.ceil(totalSeconds * 0.1) : false;
        isInLast3Minutes = remainingSeconds <= 180;
      }
    }

    // If attempt is already finished, normalize timing fields: remaining 0 and warnings false
    if (attempt.status !== 'IN_PROGRESS') {
      remainingSeconds = 0;
      isInLast10Percent = false;
      isInLast3Minutes = false;
    }

    return {
      attempt: {
        id: attempt.id,
        testId: attempt.testId,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt ?? null,
        durationMinutes,
        totalSeconds,
        endsAt,
        remainingSeconds,
        isInLast10Percent,
        isInLast3Minutes,
        savedElapsedSeconds: (attempt as any).metadata != null
          ? ((attempt as any).metadata as any)?.elapsedSeconds ?? null
          : null,
      },
      test: {
        id: test.id,
        title: test.title,
        questionCount: test.questionCount ?? (test.questions ? test.questions.length : 0),
        isTimed: !!test.isTimed,
        hasSolutions: !!test.hasSolutions,
      },
      questions,
      summary: { answeredCount, blankCount },
    };
  }
}

