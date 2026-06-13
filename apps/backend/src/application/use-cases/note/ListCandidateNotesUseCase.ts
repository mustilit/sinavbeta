import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { serializeNote } from './CreateCandidateNoteUseCase';

type Params = {
  page?: number;
  pageSize?: number;
  topicId?: string | null;
  testId?: string | null;
  examTypeId?: string | null;
  q?: string | null;
  // 'general' → yalnızca serbest (adressiz) notlar
  scope?: 'general' | null;
};

/**
 * Adayın notlarını numaralı sayfalama (offset) ile listeler. Konu/test/sınav türü
 * ve metin (body ILIKE) filtreleri destekler. total döner ki UI numaralı sayfalama
 * (Pagination) gösterebilsin. Sadece adayın kendi notları.
 */
export class ListCandidateNotesUseCase {
  async execute(actorId: string | null | undefined, params: Params) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const { topicId, testId, examTypeId, q, scope } = params;
    const pageSize = Math.min(Math.max(params.pageSize ?? 10, 1), 100);
    const page = Math.max(params.page ?? 1, 1);
    const skip = (page - 1) * pageSize;

    const text = (q ?? '').trim();
    const where = {
      candidateId: actorId,
      ...(topicId ? { topicId } : {}),
      ...(testId ? { testId } : {}),
      ...(examTypeId ? { examTypeId } : {}),
      ...(scope === 'general' ? { questionId: null, testId: null } : {}),
      ...(text ? { body: { contains: text, mode: 'insensitive' as const } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.candidateNote.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.candidateNote.count({ where }),
    ]);

    return {
      items: rows.map(serializeNote),
      total,
      page,
      pageSize,
    };
  }
}
