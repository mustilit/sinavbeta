// @ts-nocheck
export interface TestStatsRow {
  testId: string;
  ratingAvg?: number | null;
  ratingCount?: number;
  purchaseCount?: number;
}

export interface ITestStatsRepository {
  findManyByTestIds(testIds: string[]): Promise<TestStatsRow[]>;
}

