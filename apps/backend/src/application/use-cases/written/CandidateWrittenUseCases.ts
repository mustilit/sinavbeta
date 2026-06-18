import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/** Eğitici adlarını scalar educatorId'lerden çöz (modül-dışı id; relation yok). */
async function resolveEducators(educatorIds: string[]) {
  const ids = [...new Set(educatorIds.filter(Boolean))];
  if (!ids.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  return new Map(users.map((u) => [u.id, u.username || 'Eğitici']));
}

/** Yayımlanmış yazılı paketler (pazar listesi — kart alanları). */
export class ListPublishedWrittenPackagesUseCase {
  async execute(params?: { limit?: number; cursor?: string | null }) {
    const take = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const rows = await prisma.writtenPackage.findMany({
      where: { isActive: true, publishedAt: { not: null } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        description: true,
        coverImageUrl: true,
        priceCents: true,
        currency: true,
        difficulty: true,
        publishedAt: true,
        educatorId: true,
        _count: { select: { tests: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const educators = await resolveEducators(items.map((p) => p.educatorId ?? ''));
    return {
      items: items.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        coverImageUrl: p.coverImageUrl,
        priceCents: p.priceCents,
        currency: p.currency,
        difficulty: p.difficulty,
        testCount: p._count.tests,
        educatorId: p.educatorId,
        educatorName: p.educatorId ? educators.get(p.educatorId) ?? null : null,
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }
}

/** Yayımlanmış paket detay (public — ÇÖZÜM ve soru içeriği SIZDIRMAZ; sadece test listesi). */
export class GetPublishedWrittenPackageUseCase {
  async execute(packageId: string) {
    const pkg = await prisma.writtenPackage.findUnique({
      where: { id: packageId },
      select: {
        id: true,
        title: true,
        description: true,
        coverImageUrl: true,
        priceCents: true,
        currency: true,
        difficulty: true,
        isActive: true,
        publishedAt: true,
        educatorId: true,
        tests: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, title: true, isTimed: true, duration: true, questionCount: true },
        },
      },
    });
    if (!pkg || !pkg.publishedAt || !pkg.isActive)
      throw new AppError('WRITTEN_PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);

    const educators = await resolveEducators([pkg.educatorId ?? '']);
    return {
      id: pkg.id,
      title: pkg.title,
      description: pkg.description,
      coverImageUrl: pkg.coverImageUrl,
      priceCents: pkg.priceCents,
      currency: pkg.currency,
      difficulty: pkg.difficulty,
      educatorId: pkg.educatorId,
      educatorName: pkg.educatorId ? educators.get(pkg.educatorId) ?? null : null,
      tests: pkg.tests.map((t) => ({
        id: t.id,
        title: t.title,
        isTimed: t.isTimed,
        duration: t.duration,
        questionCount: t.questionCount ?? 0,
      })),
    };
  }
}
