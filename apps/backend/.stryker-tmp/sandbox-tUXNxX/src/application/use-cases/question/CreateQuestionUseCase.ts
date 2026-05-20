// @ts-nocheck
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { randomUUID } from 'crypto';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Test paketine yeni soru ekler.
 * Soru ve seçenek ID'leri sunucu tarafında üretilir (UUID v4).
 * order verilmezse 0 atanır; eğitici daha sonra sıralamayı düzenleyebilir.
 */
export class CreateQuestionUseCase {
  constructor(private readonly examRepository: IExamRepository) {}

  async execute(testId: string, input: { content: string; mediaUrl?: string | null; order?: number; options: { content: string; mediaUrl?: string | null; isCorrect: boolean }[]; solutionText?: string | null; solutionMediaUrl?: string | null }) {
    // Admin ayarlarından soru limit kontrolü
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const maxQ = (settings as any)?.maxQuestionsPerTest ?? 100;

    const currentCount = await prisma.examQuestion.count({ where: { testId } });

    if (currentCount >= maxQ) {
      throw new AppError('QUESTION_LIMIT_EXCEEDED', `Bu teste en fazla ${maxQ} soru eklenebilir`, 400);
    }

    // ID'ler sunucuda üretilir — istemci tarafı ID enjeksiyonu engellenir
    const qId = randomUUID();
    const question = {
      id: qId,
      testId,
      content: input.content,
      mediaUrl: input.mediaUrl ?? null,
      order: input.order ?? 0,
      solutionText: input.solutionText ?? null,
      solutionMediaUrl: input.solutionMediaUrl ?? null,
      options: input.options.map(o => ({ id: randomUUID(), content: o.content, mediaUrl: o.mediaUrl ?? null, isCorrect: o.isCorrect })),
    };
    return this.examRepository.addQuestion(testId, question as any);
  }
}

