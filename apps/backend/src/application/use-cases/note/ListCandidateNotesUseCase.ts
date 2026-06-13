import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { serializeNote } from './CreateCandidateNoteUseCase';

type Params = {
  cursor?: { id: string } | null;
  limit?: number;
  topicId?: string | null;
  testId?: string | null;
  examTypeId?: string | null;
  q?: string | null;
  // 'general' → yalnızca serbest (adressiz) notlar
  scope?: 'general' | null;
};

/**
 * Adayın notlarını cursor pagination ile listeler. Konu/test/sınav türü ve metin
 * (body ILIKE) filtreleri destekler. Sadece adayın kendi notları döner.
 */
export class ListCandidateNotesUseCase {
  async execute(actorId: string | null | undefined, params: Params) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const { cursor, topicId, testId, examTypeId, q, scope } = params;
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const take = limit + 1;

    const text = (q ?? '').trim();

    const rows = await prisma.candidateNote.findMany({
      where: {
        candidateId: actorId,
        ...(topicId ? { topicId } : {}),
        ...(testId ? { testId } : {}),
        ...(examTypeId ? { examTypeId } : {}),
        ...(scope === 'general' ? { questionId: null, testId: null } : {}),
        ...(text ? { body: { contains: text, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(cursor?.id ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];

    return {
      items: items.map(serializeNote),
      nextCursor: hasMore && last ? { id: last.id } : null,
    };
  }
}
