/**
 * AdminAuditController unit testleri.
 * UseCase mock'lanır — sadece HTTP ↔ UseCase köprüsü test edilir.
 */
import { AdminAuditController } from '../../src/nest/controllers/admin.audit.controller';
import { ListAuditLogsUseCase } from '../../src/application/use-cases/admin/ListAuditLogsUseCase';

describe('AdminAuditController', () => {
  let controller: AdminAuditController;
  let mockUseCase: jest.Mocked<ListAuditLogsUseCase>;

  const mockResult = { items: [], total: 0 };

  beforeEach(() => {
    mockUseCase = {
      execute: jest.fn().mockResolvedValue(mockResult),
    } as any;
    controller = new AdminAuditController(mockUseCase);
  });

  // --- list ---

  describe('list', () => {
    it('tüm query parametrelerini use case\'e iletir', async () => {
      // Arrange
      const query: any = {
        action: 'PURCHASE',
        entityType: 'Purchase',
        entityId: 'pur-1',
        actorId: 'user-1',
        from: new Date('2025-01-01'),
        to: new Date('2025-12-31'),
        page: 2,
        limit: 50,
      };

      // Act
      const result = await controller.list(query);

      // Assert
      expect(result).toBe(mockResult);
      expect(mockUseCase.execute).toHaveBeenCalledWith({
        action: 'PURCHASE',
        entityType: 'Purchase',
        entityId: 'pur-1',
        actorId: 'user-1',
        from: query.from,
        to: query.to,
        page: 2,
        limit: 50,
      });
    });

    it('filtre olmadan çağrıldığında tüm parametreler undefined iletilir', async () => {
      // Act
      const result = await controller.list({} as any);

      // Assert
      expect(result).toBe(mockResult);
      expect(mockUseCase.execute).toHaveBeenCalledWith({
        action: undefined,
        entityType: undefined,
        entityId: undefined,
        actorId: undefined,
        from: undefined,
        to: undefined,
        page: undefined,
        limit: undefined,
      });
    });

    it('use case hatası fırlattığında üst katmana yayılır', async () => {
      // Arrange
      mockUseCase.execute.mockRejectedValueOnce(new Error('DB_ERROR'));

      // Act & Assert
      await expect(controller.list({} as any)).rejects.toThrow('DB_ERROR');
    });
  });
});
