// @ts-nocheck
import { InMemoryExamRepository } from '../../src/infrastructure/repositories/InMemoryExamRepository';
import { ListMarketplaceTestsUseCase } from '../../src/application/use-cases/test/ListMarketplaceTestsUseCase';

// ReviewAggregationService mock — Prisma bağlantısı gerektirmez
jest.mock('../../src/application/services/ReviewAggregationService', () => ({
  ReviewAggregationService: jest.fn().mockImplementation(() => ({
    getAggregatesForTestIds: jest.fn().mockResolvedValue({}),
  })),
}));

// UUID v4 formatına uyan sabit test ID'leri
const EXAM_TYPE_ID = '11111111-1111-4111-a111-111111111111';

describe('ListMarketplaceTestsUseCase', () => {
  it('filters by examTypeId and pagination', async () => {
    // Arrange
    const repo = new InMemoryExamRepository();
    await repo.save(
      { id: 't1', title: 'T1', isTimed: false, duration: null, status: 'PUBLISHED', metadata: {}, createdAt: new Date(), updatedAt: new Date() } as any,
      []
    );
    await repo.save(
      { id: 't2', title: 'T2', isTimed: true, duration: 30, status: 'PUBLISHED', metadata: {}, createdAt: new Date(), updatedAt: new Date(), examTypeId: EXAM_TYPE_ID } as any,
      []
    );
    const uc = new ListMarketplaceTestsUseCase(repo);
    // Act
    const result = await uc.execute({ examTypeId: EXAM_TYPE_ID, page: 1, limit: 10 });
    // Assert
    expect(result.meta.total).toBeGreaterThanOrEqual(1);
    expect(result.items.some((i) => (i as any).examTypeId === EXAM_TYPE_ID)).toBe(true);
  });
});
