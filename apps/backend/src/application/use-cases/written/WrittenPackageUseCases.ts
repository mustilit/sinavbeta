/**
 * WrittenPackage CRUD + publish/unpublish use-case'leri.
 * Tünel desenini takip eder: prisma doğrudan kullanılır, repository yok.
 */
import { Logger } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const MAX_TITLE = 200;
const logger = new Logger('WrittenPackage');

// ─────────────────────────────────────────────────────────────
// Yardımcılar
// ─────────────────────────────────────────────────────────────

async function findPackageForActor(
  packageId: string,
  actorId: string,
  actorRole?: string | null,
): Promise<{ id: string; educatorId: string | null; publishedAt: Date | null; tenantId: string }> {
  const pkg = await prisma.writtenPackage.findUnique({
    where: { id: packageId },
    select: { id: true, educatorId: true, publishedAt: true, tenantId: true },
  });
  if (!pkg) throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
  if (actorRole !== 'ADMIN' && pkg.educatorId !== actorId) {
    throw new AppError('FORBIDDEN', 'Bu paket size ait değil', 403);
  }
  return pkg;
}

// ─────────────────────────────────────────────────────────────
// CreateWrittenPackageUseCase
// ─────────────────────────────────────────────────────────────

type CreateInput = {
  title: string;
  description?: string | null;
  priceCents?: number;
  difficulty?: string | null;
  examTypeId?: string | null;
  gradeLevelId?: string | null;
  coverImageUrl?: string | null;
};

export class CreateWrittenPackageUseCase {
  async execute(input: CreateInput, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const title = (input.title ?? '').trim();
    if (!title) throw new AppError('TITLE_REQUIRED', 'Başlık zorunlu', 400);
    if (title.length > MAX_TITLE)
      throw new AppError('TITLE_TOO_LONG', `Başlık en fazla ${MAX_TITLE} karakter olabilir`, 400);

    const educator = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, tenantId: true },
    });
    if (!educator) throw new AppError('UNAUTHORIZED', 'Kullanıcı bulunamadı', 401);

    const priceCents = Math.max(0, Math.floor(input.priceCents ?? 0));
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 }, select: { minWrittenPriceCents: true } });
    const minPrice = (settings as any)?.minWrittenPriceCents ?? 0;
    if (priceCents > 0 && priceCents < minPrice)
      throw new AppError('WRITTEN_PRICE_TOO_LOW', `Yazılı paket fiyatı en az ${(minPrice / 100).toFixed(2)} ₺ olmalı`, 400);

    // Sınıf (GradeLevel): seçilmediyse "Genel" fallback. (scalar — relation yok)
    let gradeLevelId: string | null = input.gradeLevelId ?? null;
    if (!gradeLevelId) {
      const genel = await prisma.gradeLevel.findUnique({ where: { slug: 'genel' }, select: { id: true } });
      gradeLevelId = genel?.id ?? null;
    }

    return prisma.writtenPackage.create({
      data: {
        tenantId: educator.tenantId,
        educatorId: educator.id,
        gradeLevelId,
        title,
        description: (input.description ?? '').trim() || null,
        priceCents,
        difficulty: (input.difficulty ?? 'medium').trim() || 'medium',
        coverImageUrl: (input.coverImageUrl ?? '').trim() || null,
        isActive: true,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// UpdateWrittenPackageUseCase (meta; yayımlanmışken de serbest)
// ─────────────────────────────────────────────────────────────

type UpdateInput = {
  title?: string;
  description?: string | null;
  priceCents?: number;
  difficulty?: string | null;
  gradeLevelId?: string | null;
  coverImageUrl?: string | null;
};

export class UpdateWrittenPackageUseCase {
  async execute(packageId: string, input: UpdateInput, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    await findPackageForActor(packageId, actorId, actorRole);

    const data: Record<string, unknown> = {};

    if (input.title !== undefined) {
      const title = (input.title ?? '').trim();
      if (!title) throw new AppError('TITLE_REQUIRED', 'Başlık zorunlu', 400);
      if (title.length > MAX_TITLE)
        throw new AppError('TITLE_TOO_LONG', `Başlık en fazla ${MAX_TITLE} karakter olabilir`, 400);
      data.title = title;
    }
    if (input.description !== undefined) data.description = (input.description ?? '').trim() || null;
    if (input.priceCents !== undefined) {
      const priceCents = Math.max(0, Math.floor(input.priceCents));
      const settings = await prisma.adminSettings.findFirst({ where: { id: 1 }, select: { minWrittenPriceCents: true } });
      const minPrice = (settings as any)?.minWrittenPriceCents ?? 0;
      if (priceCents > 0 && priceCents < minPrice)
        throw new AppError('WRITTEN_PRICE_TOO_LOW', `Yazılı paket fiyatı en az ${(minPrice / 100).toFixed(2)} ₺ olmalı`, 400);
      data.priceCents = priceCents;
    }
    if (input.difficulty !== undefined) data.difficulty = (input.difficulty ?? '').trim() || 'medium';
    if (input.gradeLevelId !== undefined) data.gradeLevelId = input.gradeLevelId || null;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = (input.coverImageUrl ?? '').trim() || null;

    if (Object.keys(data).length === 0) {
      // Güncellenecek alan yok — mevcut kaydı döndür
      return prisma.writtenPackage.findUnique({ where: { id: packageId } });
    }

    const updated = await prisma.writtenPackage.update({
      where: { id: packageId },
      data,
    });

    // İşlem geçmişi / audit — yazılı paket meta güncelleme (değişen alanlar; best-effort).
    await prisma.auditLog
      .create({
        data: {
          action: 'WRITTEN_UPDATED', entityType: 'WrittenPackage', entityId: packageId, actorId: actorId ?? null,
          metadata: { kind: 'written', changedFields: Object.keys(data) } as object,
          tenantId: (updated as any).tenantId ?? null,
        },
      })
      .catch((e) => logger.warn('written_package.update.audit_failed', { error: (e as any)?.message, packageId, actorId }));

    return updated;
  }
}

// ─────────────────────────────────────────────────────────────
// PublishWrittenPackageUseCase
// ─────────────────────────────────────────────────────────────

export class PublishWrittenPackageUseCase {
  async execute(packageId: string, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    await findPackageForActor(packageId, actorId, actorRole);

    // Paket içindeki testleri + sorularını çek
    const tests = await prisma.writtenTest.findMany({
      where: { packageId, deletedAt: null },
      include: {
        questions: {
          select: { id: true, solutionText: true, solutionMediaUrl: true },
        },
      },
    });

    if (tests.length === 0) {
      throw new AppError('NO_TESTS', 'Paket en az bir test içermeli', 400);
    }

    // Admin limiti: yazılı test başına min/max soru
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const minQ = (settings as any)?.minQuestionsPerWrittenTest ?? 1;
    const maxQ = (settings as any)?.maxQuestionsPerWrittenTest ?? 50;

    for (const test of tests) {
      if (test.questions.length < minQ) {
        throw new AppError(
          'TEST_HAS_NO_QUESTIONS',
          `"${test.title}" testi en az ${minQ} soru içermeli`,
          400,
        );
      }
      if (test.questions.length > maxQ) {
        throw new AppError(
          'TEST_TOO_MANY_QUESTIONS',
          `"${test.title}" testi en fazla ${maxQ} soru içerebilir`,
          400,
        );
      }
      for (const q of test.questions) {
        const hasSolution =
          (q.solutionText ?? '').trim().length > 0 || (q.solutionMediaUrl ?? '').trim().length > 0;
        if (!hasSolution) {
          throw new AppError(
            'QUESTION_MISSING_SOLUTION',
            'Tüm soruların çözümü olmalı (solutionText veya solutionMediaUrl)',
            400,
          );
        }
      }
    }

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      // Tüm testleri PUBLISHED yap
      for (const test of tests) {
        await tx.writtenTest.update({
          where: { id: test.id },
          data: { status: 'PUBLISHED', publishedAt: now },
        });
      }
      // Paketi yayımla
      const updated = await tx.writtenPackage.update({
        where: { id: packageId },
        data: { publishedAt: now, isActive: true },
      });
      // İşlem geçmişi / audit — yazılı paket yayımlama (yayımla ile aynı transaction).
      await tx.auditLog.create({
        data: {
          action: 'WRITTEN_PUBLISHED', entityType: 'WrittenPackage', entityId: packageId, actorId: actorId ?? null,
          metadata: { kind: 'written', testCount: tests.length } as object, tenantId: (updated as any).tenantId ?? null,
        },
      });
      logger.log({ msg: 'written_package.published', packageId, actorId, testCount: tests.length });
      return updated;
    });
  }
}

// ─────────────────────────────────────────────────────────────
// UnpublishWrittenPackageUseCase
// ─────────────────────────────────────────────────────────────

export class UnpublishWrittenPackageUseCase {
  async execute(packageId: string, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    await findPackageForActor(packageId, actorId, actorRole);

    return prisma.$transaction(async (tx) => {
      // Tüm testleri UNPUBLISHED yap
      await tx.writtenTest.updateMany({
        where: { packageId, deletedAt: null },
        data: { status: 'UNPUBLISHED' },
      });
      const updated = await tx.writtenPackage.update({
        where: { id: packageId },
        data: { publishedAt: null, isActive: false },
      });
      // İşlem geçmişi / audit — yazılı paket yayından kaldırma (aynı transaction).
      await tx.auditLog.create({
        data: {
          action: 'WRITTEN_UNPUBLISHED', entityType: 'WrittenPackage', entityId: packageId, actorId: actorId ?? null,
          metadata: { kind: 'written' } as object, tenantId: (updated as any).tenantId ?? null,
        },
      });
      logger.log({ msg: 'written_package.unpublished', packageId, actorId });
      return updated;
    });
  }
}

// ─────────────────────────────────────────────────────────────
// ListEducatorWrittenPackagesUseCase
// ─────────────────────────────────────────────────────────────

export class ListEducatorWrittenPackagesUseCase {
  async execute(actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const packages = await prisma.writtenPackage.findMany({
      where: { educatorId: actorId },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        difficulty: true,
        coverImageUrl: true,
        isActive: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { tests: true } },
      },
    });

    return {
      items: packages.map((pkg) => ({
        ...pkg,
        testCount: pkg._count.tests,
        _count: undefined,
      })),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// GetWrittenPackageUseCase (detay — eğitici görür, solutionText dahil)
// ─────────────────────────────────────────────────────────────

export class GetWrittenPackageUseCase {
  async execute(packageId: string, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const pkg = await prisma.writtenPackage.findUnique({
      where: { id: packageId },
      include: {
        tests: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'asc' }],
          include: {
            questions: {
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              // solutionText DAHİL — eğitici görür
              select: {
                id: true,
                content: true,
                mediaUrl: true,
                order: true,
                solutionText: true,
                solutionMediaUrl: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!pkg) throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    if (actorRole !== 'ADMIN' && pkg.educatorId !== actorId) {
      throw new AppError('FORBIDDEN', 'Bu paket size ait değil', 403);
    }

    return pkg;
  }
}
