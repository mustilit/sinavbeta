/**
 * WrittenQuestion CRUD use-case'leri.
 * ŞIK YOK. solutionText VEYA solutionMediaUrl zorunlu (create'de).
 * Yayın kilidi: package.publishedAt != null → içerik değiştirilemez.
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

// ─────────────────────────────────────────────────────────────
// Yardımcılar
// ─────────────────────────────────────────────────────────────

/** Soru → test → paket sahiplik zinciri doğrulama. */
async function resolveQuestionForActor(
  testId: string,
  questionId: string,
  actorId: string,
  actorRole?: string | null,
): Promise<{
  question: { id: string };
  test: { id: string; packageId: string | null };
  pkg: { id: string; publishedAt: Date | null; educatorId: string | null } | null;
}> {
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

  const question = await prisma.writtenQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, testId: true },
  });
  if (!question || question.testId !== testId) {
    throw new AppError('QUESTION_NOT_FOUND', 'Soru bulunamadı', 404);
  }

  return { question: { id: question.id }, test: { id: test.id, packageId: test.packageId }, pkg };
}

function assertNotPublished(pkg: { publishedAt: Date | null } | null) {
  if (pkg?.publishedAt) {
    throw new AppError('PACKAGE_PUBLISHED', 'Yayımlanmış paketin içeriği değiştirilemez', 409);
  }
}

async function recountQuestions(testId: string) {
  const count = await prisma.writtenQuestion.count({ where: { testId } });
  await prisma.writtenTest.update({
    where: { id: testId },
    data: { questionCount: count },
  });
  return count;
}

// ─────────────────────────────────────────────────────────────
// CreateWrittenQuestionUseCase
// ─────────────────────────────────────────────────────────────

type CreateInput = {
  testId: string;
  content?: string | null;
  mediaUrl?: string | null;
  order?: number;
  solutionText?: string | null;
  solutionMediaUrl?: string | null;
};

export class CreateWrittenQuestionUseCase {
  async execute(input: CreateInput, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    // content VEYA mediaUrl zorunlu
    const content = (input.content ?? '').trim();
    const mediaUrl = (input.mediaUrl ?? '').trim();
    if (!content && !mediaUrl) {
      throw new AppError('CONTENT_REQUIRED', 'Soru metni (content) veya medya URL (mediaUrl) zorunlu', 400);
    }

    // solutionText VEYA solutionMediaUrl zorunlu
    const solutionText = (input.solutionText ?? '').trim();
    const solutionMediaUrl = (input.solutionMediaUrl ?? '').trim();
    if (!solutionText && !solutionMediaUrl) {
      throw new AppError('SOLUTION_REQUIRED', 'Çözüm zorunludur (solutionText veya solutionMediaUrl)', 400);
    }

    // Test → paket sahiplik + yayın kilidi
    const test = await prisma.writtenTest.findUnique({
      where: { id: input.testId, deletedAt: null },
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
    assertNotPublished(pkg);

    // Admin limiti: yazılı test başına maksimum soru
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const maxQ = (settings as any)?.maxQuestionsPerWrittenTest ?? 50;
    const currentQ = await prisma.writtenQuestion.count({ where: { testId: test.id } });
    if (currentQ >= maxQ) {
      throw new AppError('QUESTION_LIMIT_EXCEEDED', `Bu yazılı teste en fazla ${maxQ} soru eklenebilir`, 400);
    }

    const question = await prisma.writtenQuestion.create({
      data: {
        testId: test.id,
        // content schema'da NOT NULL; mediaUrl-only durumda boş string saklanır
        content: content || '',
        mediaUrl: mediaUrl || null,
        order: input.order ?? 0,
        solutionText: solutionText || null,
        solutionMediaUrl: solutionMediaUrl || null,
      },
    });

    await recountQuestions(test.id);

    return question;
  }
}

// ─────────────────────────────────────────────────────────────
// UpdateWrittenQuestionUseCase
// ─────────────────────────────────────────────────────────────

type UpdateInput = {
  content?: string | null;
  mediaUrl?: string | null;
  order?: number;
  solutionText?: string | null;
  solutionMediaUrl?: string | null;
};

export class UpdateWrittenQuestionUseCase {
  async execute(
    testId: string,
    questionId: string,
    input: UpdateInput,
    actorId?: string | null,
    actorRole?: string | null,
  ) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const { pkg } = await resolveQuestionForActor(testId, questionId, actorId, actorRole);
    assertNotPublished(pkg);

    const data: Record<string, unknown> = {};

    if (input.content !== undefined) data.content = (input.content ?? '').trim() || null;
    if (input.mediaUrl !== undefined) data.mediaUrl = (input.mediaUrl ?? '').trim() || null;
    if (input.order !== undefined) data.order = input.order;
    if (input.solutionText !== undefined) data.solutionText = (input.solutionText ?? '').trim() || null;
    if (input.solutionMediaUrl !== undefined)
      data.solutionMediaUrl = (input.solutionMediaUrl ?? '').trim() || null;

    if (Object.keys(data).length === 0) {
      return prisma.writtenQuestion.findUnique({ where: { id: questionId } });
    }

    return prisma.writtenQuestion.update({
      where: { id: questionId },
      data,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// DeleteWrittenQuestionUseCase
// ─────────────────────────────────────────────────────────────

export class DeleteWrittenQuestionUseCase {
  async execute(testId: string, questionId: string, actorId?: string | null, actorRole?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const { question, test, pkg } = await resolveQuestionForActor(testId, questionId, actorId, actorRole);
    assertNotPublished(pkg);

    await prisma.writtenQuestion.delete({ where: { id: question.id } });
    await recountQuestions(test.id);

    return { ok: true };
  }
}
