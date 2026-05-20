// @ts-nocheck
export type ReviewRecord = {
  id: string;
  testId: string;
  educatorId: string;
  candidateId: string;
  testRating: number;
  educatorRating?: number | null;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface IReviewRepository {
  upsertReview(input: { testId: string; educatorId: string; candidateId: string; testRating?: number; educatorRating?: number; comment?: string }): Promise<ReviewRecord>;
  listReviewsForTest(testId: string, limit?: number, cursor?: string): Promise<{ items: ReviewRecord[]; nextCursor?: string }>;
  getAggregateForTest(testId: string): Promise<{ avg: number | null; count: number }>;
  getAggregateForEducator(educatorId: string): Promise<{ avg: number | null; count: number }>;
}

