import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { ModerateTextContentUseCase } from '../moderation/ModerateTextContentUseCase';

async function requireActivePurchase(candidateId: string, packageId: string) {
  const p = await prisma.writtenPurchase.findUnique({
    where: { candidateId_packageId: { candidateId, packageId } },
    select: { status: true, tenantId: true },
  });
  if (!p || p.status !== 'ACTIVE') throw new AppError('NOT_PURCHASED', 'Bu paketi satın almadınız', 403);
  return p;
}

/** Aday yazılı paket değerlendirmesi (yalnız satın alan). Paket başına tek (upsert). */
export class UpsertWrittenReviewUseCase {
  constructor(private readonly moderate?: ModerateTextContentUseCase) {}

  async execute(packageId: string, actorId: string | null | undefined, input: { rating: number; comment?: string | null }) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const rating = Math.round(Number(input.rating));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new AppError('INVALID_RATING', 'Puan 1-5 arası olmalı', 400);
    const purchase = await requireActivePurchase(actorId, packageId);
    const comment = (input.comment ?? '').trim().slice(0, 2000) || null;

    // İçerik moderasyonu — uygunsuz yorum SERT BLOK (aday yorumu, paket review deseni).
    if (this.moderate && comment) {
      const verdict = await this.moderate.execute({
        entityType: 'WrittenReview',
        entityId: `${packageId}:${actorId}`,
        userId: actorId,
        tenantId: purchase.tenantId ?? '',
        text: comment,
        isEducatorContent: false,
      });
      if (!verdict.allowed)
        throw new AppError('COMMENT_REJECTED', verdict.message ?? 'Yorumunuz uygunsuz içerik nedeniyle reddedildi.', 400);
    }

    const existing = await prisma.writtenReview.findUnique({
      where: { packageId_candidateId: { packageId, candidateId: actorId } },
      select: { id: true },
    });
    let reviewId: string;
    if (existing) {
      await prisma.writtenReview.update({ where: { id: existing.id }, data: { rating, comment } });
      reviewId = existing.id;
    } else {
      const created = await prisma.writtenReview.create({
        data: { tenantId: purchase.tenantId, packageId, candidateId: actorId, rating, comment },
        select: { id: true },
      });
      reviewId = created.id;
    }
    // İşlem geçmişi / audit — değerlendirme (best-effort, akışı bloke etmez).
    await prisma.auditLog
      .create({
        data: {
          action: 'REVIEW_UPSERTED', entityType: 'WrittenReview', entityId: reviewId, actorId,
          metadata: { kind: 'written', packageId, rating } as object, tenantId: purchase.tenantId ?? null,
        },
      })
      .catch(() => {});
    return { ok: true };
  }
}

/** Yazılı paket değerlendirmeleri: ortalama + sayı + sayfalı liste (gizlilik: yalnız ad). */
export class ListWrittenReviewsUseCase {
  async execute(packageId: string, opts?: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(opts?.limit ?? 10, 1), 50);
    const offset = Math.max(opts?.offset ?? 0, 0);

    const [agg, rows] = await Promise.all([
      prisma.writtenReview.aggregate({ where: { packageId }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.writtenReview.findMany({
        where: { packageId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: { id: true, rating: true, comment: true, createdAt: true, candidateId: true },
      }),
    ]);

    const ids = [...new Set(rows.map((r) => r.candidateId))];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.username]));

    return {
      avg: agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null,
      count: agg._count._all,
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        candidateName: nameById.get(r.candidateId) ?? 'Aday',
      })),
    };
  }
}

/** Adayın kendi değerlendirmesi (varsa). */
export class GetMyWrittenReviewUseCase {
  async execute(packageId: string, actorId?: string | null) {
    if (!actorId) return null;
    const r = await prisma.writtenReview.findUnique({
      where: { packageId_candidateId: { packageId, candidateId: actorId } },
      select: { rating: true, comment: true, createdAt: true, updatedAt: true },
    });
    return r ?? null;
  }
}
