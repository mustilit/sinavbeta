/**
 * ReviewAggregationService unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: {
      findMany: jest.fn(),
    },
    review: {
      groupBy: jest.fn(),
    },
  },
}));

import { ReviewAggregationService } from '../../src/application/services/ReviewAggregationService';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

describe('ReviewAggregationService', () => {
  let service: ReviewAggregationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReviewAggregationService();
  });

  // --- getAggregatesForTestIds ---

  describe('getAggregatesForTestIds', () => {
    it('boş liste geçildiğinde boş nesne döner', async () => {
      const result = await service.getAggregatesForTestIds([]);
      expect(result).toEqual({});
      expect(mock.examTest.findMany).not.toHaveBeenCalled();
    });

    it('testlerin paket ataması yoksa her test için avg null ve count 0 döner', async () => {
      // Arrange
      mock.examTest.findMany.mockResolvedValueOnce([
        { id: 'test-1', packageId: null },
        { id: 'test-2', packageId: null },
      ]);

      // Act
      const result = await service.getAggregatesForTestIds(['test-1', 'test-2']);

      // Assert
      expect(result).toEqual({
        'test-1': { avg: null, count: 0 },
        'test-2': { avg: null, count: 0 },
      });
      expect(mock.review.groupBy).not.toHaveBeenCalled();
    });

    it('paket ataması olan testler için review agregat döner', async () => {
      // Arrange
      mock.examTest.findMany.mockResolvedValueOnce([
        { id: 'test-1', packageId: 'pkg-1' },
        { id: 'test-2', packageId: 'pkg-1' },
      ]);
      mock.review.groupBy.mockResolvedValueOnce([
        { packageId: 'pkg-1', _avg: { testRating: 4.5 }, _count: { _all: 10 } },
      ]);

      // Act
      const result = await service.getAggregatesForTestIds(['test-1', 'test-2']);

      // Assert
      // Aynı paketteki testler aynı agregat değerini alır
      expect(result['test-1']).toEqual({ avg: 4.5, count: 10 });
      expect(result['test-2']).toEqual({ avg: 4.5, count: 10 });
    });

    it('paket varsa ama review yoksa null avg ve 0 count döner', async () => {
      // Arrange
      mock.examTest.findMany.mockResolvedValueOnce([
        { id: 'test-1', packageId: 'pkg-1' },
      ]);
      mock.review.groupBy.mockResolvedValueOnce([]); // Hiç review yok

      // Act
      const result = await service.getAggregatesForTestIds(['test-1']);

      // Assert
      expect(result['test-1']).toEqual({ avg: null, count: 0 });
    });

    it('birden fazla paket için doğru eşleme yapar', async () => {
      // Arrange
      mock.examTest.findMany.mockResolvedValueOnce([
        { id: 'test-1', packageId: 'pkg-1' },
        { id: 'test-2', packageId: 'pkg-2' },
      ]);
      mock.review.groupBy.mockResolvedValueOnce([
        { packageId: 'pkg-1', _avg: { testRating: 4.0 }, _count: { _all: 5 } },
        { packageId: 'pkg-2', _avg: { testRating: 3.0 }, _count: { _all: 2 } },
      ]);

      // Act
      const result = await service.getAggregatesForTestIds(['test-1', 'test-2']);

      // Assert
      expect(result['test-1']).toEqual({ avg: 4.0, count: 5 });
      expect(result['test-2']).toEqual({ avg: 3.0, count: 2 });
    });
  });
});
