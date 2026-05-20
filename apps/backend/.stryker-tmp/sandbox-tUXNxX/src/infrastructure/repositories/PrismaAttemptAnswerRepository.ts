// @ts-nocheck
import { prisma } from '../database/prisma';
import { IAttemptAnswerRepository, AttemptAnswerRow } from '../../domain/interfaces/IAttemptAnswerRepository';

export class PrismaAttemptAnswerRepository implements IAttemptAnswerRepository {
  async findByAttemptId(attemptId: string): Promise<AttemptAnswerRow[]> {
    const rows = await prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: { questionId: true, selectedOptionId: true },
    });
    return rows.map((r) => ({ questionId: r.questionId, selectedOptionId: r.selectedOptionId ?? null }));
  }
  async findByAttemptIdWithOptionCorrectness(attemptId: string): Promise<Array<{ questionId: string; selectedOptionId: string | null; isCorrect: boolean | null }>> {
    const rows = await prisma.attemptAnswer.findMany({
      where: { attemptId },
      select: {
        questionId: true,
        selectedOptionId: true,
        option: { select: { isCorrect: true } },
      },
    });
    return rows.map((r: any) => ({
      questionId: r.questionId,
      selectedOptionId: r.selectedOptionId ?? null,
      isCorrect: r.option ? (r.option.isCorrect as boolean) : null,
    }));
  }
}

