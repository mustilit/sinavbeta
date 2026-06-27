import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

/** Tek testin özet bilgisi — paket detayında tests[] array'i için. */
export interface MarketplacePackageTestItem {
  id: string;
  title: string;
  questionCount: number;
  duration: number | null; // dakika cinsinden, süresiz testlerde null
}

/** Paket detay endpoint'inin dönüş şekli. */
export interface MarketplacePackageDetail {
  id: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  priceCents: number;
  difficulty: string;
  language: string;
  publishedAt: string;
  educatorId: string | null;
  educatorUsername: string | null;
  examTypeId: string | null;
  examTypeName: string | null;
  gradeLevelId: string | null;
  gradeLevelName: string | null;
  questionCount: number;
  testCount: number;
  tests: MarketplacePackageTestItem[];
}

/**
 * Tek bir yayınlı test paketini ID ile getirir.
 * publishedAt IS NOT NULL zorunludur — taslak paketler 404 döner.
 */
export class GetMarketplacePackageUseCase {
  async execute(id: string): Promise<MarketplacePackageDetail> {
    // Önce TestPackage olarak dene; bulunamazsa ExamTest'ten üst paketi bul (eski URL uyumu)
    let resolvedId = id;
    const directPkg = await (prisma.testPackage as any).findUnique({ where: { id }, select: { id: true } });
    if (!directPkg) {
      const test = await prisma.examTest.findUnique({ where: { id }, select: { packageId: true } });
      if (test?.packageId) {
        resolvedId = test.packageId;
      }
    }

    const pkg = await (prisma.testPackage as any).findUnique({
      where: { id: resolvedId },
      include: {
        educator: {
          select: { id: true, username: true },
        },
        tests: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            title: true,
            duration: true,
            isTimed: true,
            examTypeId: true,
            examType: {
              select: { id: true, name: true },
            },
            gradeLevelId: true,
            gradeLevel: {
              select: { id: true, name: true },
            },
            _count: {
              select: { questions: true },
            },
          },
        },
      },
    });

    if (!pkg) {
      throw new AppError('NOT_FOUND', 'Package not found', 404);
    }

    // Taslak (publishedAt null) paketler marketplace'te görünmez
    if (!pkg.publishedAt) {
      throw new AppError('NOT_FOUND', 'Package not found', 404);
    }

    const tests: any[] = pkg.tests ?? [];

    const questionCount = tests.reduce((sum: number, t: any) => sum + (t._count?.questions ?? 0), 0);

    const firstTestWithType = tests.find((t: any) => t.examTypeId != null);
    const examTypeId: string | null = firstTestWithType?.examTypeId ?? null;
    const examTypeName: string | null = firstTestWithType?.examType?.name ?? null;
    const firstTestWithGrade = tests.find((t: any) => t.gradeLevelId != null);
    const gradeLevelId: string | null = firstTestWithGrade?.gradeLevelId ?? null;
    const gradeLevelName: string | null = firstTestWithGrade?.gradeLevel?.name ?? null;

    const testItems: MarketplacePackageTestItem[] = tests.map((t: any) => ({
      id: t.id,
      title: t.title,
      questionCount: t._count?.questions ?? 0,
      duration: t.isTimed ? (t.duration ?? null) : null,
    }));

    return {
      id: pkg.id,
      title: pkg.title,
      description: pkg.description ?? null,
      coverImageUrl: pkg.coverImageUrl ?? null,
      priceCents: pkg.priceCents,
      difficulty: pkg.difficulty ?? 'medium',
      language: pkg.language ?? 'tr',
      publishedAt: (pkg.publishedAt as Date).toISOString(),
      educatorId: pkg.educatorId ?? null,
      educatorUsername: pkg.educator?.username ?? null,
      examTypeId,
      examTypeName,
      gradeLevelId,
      gradeLevelName,
      questionCount,
      testCount: tests.length,
      tests: testItems,
    };
  }
}
