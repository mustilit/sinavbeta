import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/**
 * Notlarım filtre seçeneklerini döndürür: adayın notlarında geçen DISTINCT konu,
 * test ve sınav türleri (snapshot isimleriyle). Dropdown'ları doldurmak için —
 * tüm notları çekmeden. Ayrıca serbest ("genel") not var mı bilgisini verir.
 */
export class GetCandidateNoteFacetsUseCase {
  async execute(actorId: string | null | undefined) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const [topicRows, testRows, examTypeRows, generalCount] = await Promise.all([
      prisma.candidateNote.groupBy({
        by: ['topicId', 'topicName'],
        where: { candidateId: actorId, topicId: { not: null } },
      }),
      prisma.candidateNote.groupBy({
        by: ['testId', 'testTitle'],
        where: { candidateId: actorId, testId: { not: null } },
      }),
      prisma.candidateNote.groupBy({
        by: ['examTypeId', 'examTypeName'],
        where: { candidateId: actorId, examTypeId: { not: null } },
      }),
      prisma.candidateNote.count({
        where: { candidateId: actorId, questionId: null, testId: null },
      }),
    ]);

    return {
      topics: topicRows
        .filter((r) => r.topicId)
        .map((r) => ({ id: r.topicId as string, name: r.topicName ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      tests: testRows
        .filter((r) => r.testId)
        .map((r) => ({ id: r.testId as string, title: r.testTitle ?? '' }))
        .sort((a, b) => a.title.localeCompare(b.title, 'tr')),
      examTypes: examTypeRows
        .filter((r) => r.examTypeId)
        .map((r) => ({ id: r.examTypeId as string, name: r.examTypeName ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      hasGeneral: generalCount > 0,
    };
  }
}
