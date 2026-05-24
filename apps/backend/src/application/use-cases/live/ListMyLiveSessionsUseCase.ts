import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

type Status = 'DRAFT' | 'ACTIVE' | 'ENDED';
type Params = {
  cursor?: { id: string; createdAt: Date };
  limit?: number;
  status?: Status;
};

/**
 * Eğiticinin canlı oturumlarını cursor-pagination ile döner.
 *
 * Liste yalnızca **parent** kayıtları (roundNumber !== 2) içerir; Tur 2
 * oturumları ayrı bir map olarak döner (round2ByParent), frontend tek listede
 * parent + child birlikte gösterir. Cursor sıralaması: `createdAt DESC, id DESC`
 * (composite — aynı milisaniyede tie-breaker).
 */
export class ListMyLiveSessionsUseCase {
  async execute(educatorId: string, params: Params = {}) {
    if (!educatorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const take = limit + 1; // hasMore tek query'de

    const where: any = {
      educatorId,
      // Tur 2 oturumları liste düzeyinde parent altında — burada hariç tut.
      OR: [{ parentSessionId: null }, { roundNumber: { not: 2 } }],
    };
    if (params.status) where.status = params.status;

    const parents = await prisma.liveSession.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(params.cursor && {
        cursor: { id: params.cursor.id },
        skip: 1,
      }),
      include: { _count: { select: { questions: true, participants: true } } },
    });

    const hasMore = parents.length > limit;
    const items = hasMore ? parents.slice(0, -1) : parents;
    const last = items[items.length - 1];

    // Bu sayfada gelen parent'ların round 2 kardeşleri (tek seferlik ek query).
    let round2: any[] = [];
    if (items.length > 0) {
      round2 = await prisma.liveSession.findMany({
        where: {
          educatorId,
          parentSessionId: { in: items.map((p: any) => p.id) },
        },
        include: { _count: { select: { questions: true, participants: true } } },
      });
    }

    return {
      items,
      round2,
      nextCursor:
        hasMore && last
          ? { id: last.id, createdAt: (last as any).createdAt.toISOString() }
          : null,
    };
  }
}
