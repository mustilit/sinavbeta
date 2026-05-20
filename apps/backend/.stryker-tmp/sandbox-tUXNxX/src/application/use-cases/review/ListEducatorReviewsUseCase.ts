// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

export interface EducatorReviewItem {
  id: string;
  testId: string;
  testTitle: string;
  testRating: number;
  educatorRating: number | null;
  comment: string | null;
  createdAt: string;
}

export class ListEducatorReviewsUseCase {
  async execute(educatorId: string, limit = 20): Promise<EducatorReviewItem[]> {
    const safeLimit = Math.min(50, Math.max(1, limit));

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        testId: string;
        test_title: string | null;
        testRating: number;
        educatorRating: number | null;
        comment: string | null;
        createdAt: Date;
      }>
    >`
      SELECT r.id, r."testId", t.title AS test_title,
             r."testRating", r."educatorRating", r.comment, r."createdAt"
      FROM reviews r
      JOIN exam_tests t ON r."testId" = t.id
      WHERE r."educatorId" = ${educatorId}
      ORDER BY r."createdAt" DESC
      LIMIT ${safeLimit}
    `;

    return rows.map((r) => ({
      id: r.id,
      testId: r.testId,
      testTitle: r.test_title ?? '',
      testRating: r.testRating,
      educatorRating: r.educatorRating ?? null,
      comment: r.comment ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  }
}
