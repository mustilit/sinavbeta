/**
 * WrittenTest CRUD use-case'leri.
 * Yayın kilidi: package.publishedAt != null → içerik değiştirilemez.
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const MAX_TITLE = 200;

// ─────────────────────────────────────────────────────────────
// Yardımcılar
// ─────────────────────────────────────────────────────────────

/** Test → paket sahiplik zinciri doğrulama. */
async function resolveTestForActor(
  testId: string,
  actorId: string,
  actorRole?: string | null,
): Promise<{ id: string; packageId: string | null; pkg: { id: string; publishedAt: Date | null; educatorId: string | null } | null }> {
  const test = await prisma.writtenTest.findUnique({
    where: { id: testId, deletedAt: null },
    select: {
      id: true,
      packageId: true,
      package: { select: { id: true, publishedAt: true, educatorId: true } },
    },
  });
  if (!test) throw new AppError('TEST_NOT_FOUND', 'Test bulunamadı', 404);

  const pkg = test.package;
  if (actorRole !== 'ADMIN') {
    if (!pkg || pkg.educatorId !== actorId) {
      throw new AppError('FORBIDDEN', 'Bu test size ait değil', 403);
    }
  }

  return { id: test.id, packageId: test.packageId, pkg };
}

function assertNotPublished(pkg: { publishedAt: Date | null } | null) {
  if (pkg?.publishedAt) {
    throw new AppError('PACKAGE_PUBLISHED', 'Yayımlanmış paketin içeriği değiştirilemez', 409);
  }
}

// ─────────────────────────────────────────────────────────────
// CreateWrittenTestUseCase
// ─────────────────────────────────────────────────────────────

type CreateInput = {
  packageId: string;
  title: string;
  isTimed?: boolean;
  duration?: number | null;
  examTypeId?: string | null;
  topicId?: string | null;
};

export class CreateWrittenTestUseCase {
  async execute(input: CreateInput, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const title = (input.title ?? '').trim();
    if (!title) throw new AppError('TITLE_REQUIRED', 'Başlık zorunlu', 400);
    if (title.length > MAX_TITLE)
      throw new AppError('TITLE_TOO_LONG', `Başlık en fazla ${MAX_TITLE} karakter olabilir`, 400);

    // Paketin var olduğunu ve sahibini doğrula
    const pkg = await prisma.writtenPackage.findUnique({
      where: { id: input.packageId },
      select: { id: true, educatorId: true, publishedAt: true, tenantId: true },
    });
    if (!pkg) throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    if (actorRole !== 'ADMIN' && pkg.educatorId !== actorId) {
      throw new AppError('FORBIDDEN', 'Bu paket size ait değil', 403);
    }
    assertNotPublished(pkg);

    // Admin limiti: paket başına maksimum yazılı test
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const maxTests = (settings as any)?.maxWrittenTestsPerPackage ?? 10;
    const currentTests = await prisma.writtenTest.count({ where: { packageId: pkg.id, deletedAt: null } });
    if (currentTests >= maxTests) {
      throw new AppError('PACKAGE_FULL', `Pakete en fazla ${maxTests} yazılı test eklenebilir`, 400);
    }

    return prisma.writtenTest.create({
      data: {
        tenantId: pkg.tenantId,
        packageId: pkg.id,
        educatorId: pkg.educatorId,
        title,
        isTimed: input.isTimed ?? false,
        duration: input.duration ?? null,
        examTypeId: input.examTypeId ?? null,
        topicId: input.topicId ?? null,
        status: 'DRAFT',
        hasSolutions: true,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// UpdateWrittenTestUseCase
// ─────────────────────────────────────────────────────────────

type UpdateInput = {
  title?: string;
  isTimed?: boolean;
  duration?: number | null;
  examTypeId?: string | null;
  topicId?: string | null;
};

export class UpdateWrittenTestUseCase {
  async execute(testId: string, input: UpdateInput, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const { pkg } = await resolveTestForActor(testId, actorId, actorRole);
    assertNotPublished(pkg);

    const data: Record<string, unknown> = {};

    if (input.title !== undefined) {
      const title = (input.title ?? '').trim();
      if (!title) throw new AppError('TITLE_REQUIRED', 'Başlık zorunlu', 400);
      if (title.length > MAX_TITLE)
        throw new AppError('TITLE_TOO_LONG', `Başlık en fazla ${MAX_TITLE} karakter olabilir`, 400);
      data.title = title;
    }
    if (input.isTimed !== undefined) data.isTimed = input.isTimed;
    if (input.duration !== undefined) data.duration = input.duration;
    if (input.examTypeId !== undefined) data.examTypeId = input.examTypeId;
    if (input.topicId !== undefined) data.topicId = input.topicId;

    if (Object.keys(data).length === 0) {
      return prisma.writtenTest.findUnique({ where: { id: testId } });
    }

    return prisma.writtenTest.update({
      where: { id: testId },
      data,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// DeleteWrittenTestUseCase (soft delete)
// ─────────────────────────────────────────────────────────────

export class DeleteWrittenTestUseCase {
  async execute(testId: string, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const { pkg } = await resolveTestForActor(testId, actorId, actorRole);
    assertNotPublished(pkg);

    return prisma.writtenTest.update({
      where: { id: testId },
      data: { deletedAt: new Date() },
    });
  }
}
