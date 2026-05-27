/**
 * AdminRefundsController unit testleri.
 * Üç use case mock'lanır.
 */
import { AdminRefundsController } from '../../src/nest/controllers/admin.refunds.controller';
import { ApproveRefundUseCase } from '../../src/application/use-cases/refund/ApproveRefundUseCase';
import { RejectRefundUseCase } from '../../src/application/use-cases/refund/RejectRefundUseCase';
import { ListPendingRefundsUseCase } from '../../src/application/use-cases/refund/ListPendingRefundsUseCase';

const makeRefundItem = (id: string) => ({
  id,
  status: 'PENDING',
  candidateId: 'cand-1',
  educatorId: 'edu-1',
  testId: 'test-1',
  purchaseId: 'pur-1',
  reason: 'test',
  createdAt: new Date().toISOString(),
});

describe('AdminRefundsController', () => {
  let controller: AdminRefundsController;
  let mockApprove: jest.Mocked<ApproveRefundUseCase>;
  let mockReject: jest.Mocked<RejectRefundUseCase>;
  let mockList: jest.Mocked<ListPendingRefundsUseCase>;

  beforeEach(() => {
    mockApprove = { execute: jest.fn().mockResolvedValue(makeRefundItem('ref-1')) } as any;
    mockReject = { execute: jest.fn().mockResolvedValue(makeRefundItem('ref-1')) } as any;
    mockList = { execute: jest.fn().mockResolvedValue([makeRefundItem('ref-1')]) } as any;
    controller = new AdminRefundsController(mockApprove, mockReject, mockList);
  });

  // --- list ---

  describe('list', () => {
    it('status parametresi kullanılır', async () => {
      await controller.list({ status: 'APPROVED' } as any);
      expect(mockList.execute).toHaveBeenCalledWith('APPROVED');
    });

    it('status yoksa default PENDING kullanılır', async () => {
      await controller.list({} as any);
      expect(mockList.execute).toHaveBeenCalledWith('PENDING');
    });
  });

  // --- approve ---

  describe('approve', () => {
    it('doğru id ve actorId ile use case\'i çağırır', async () => {
      // Arrange
      const req = { user: { id: 'admin-1' } };

      // Act
      const result = await controller.approve('ref-1', req as any);

      // Assert
      expect(result).toBeDefined();
      expect(mockApprove.execute).toHaveBeenCalledWith('ref-1', 'admin-1');
    });

    it('use case hata fırlattığında üst katmana yayılır', async () => {
      mockApprove.execute.mockRejectedValueOnce(new Error('REFUND_ALREADY_DECIDED'));
      await expect(controller.approve('ref-1', { user: { id: 'admin-1' } } as any)).rejects.toThrow('REFUND_ALREADY_DECIDED');
    });
  });

  // --- reject ---

  describe('reject', () => {
    it('id, actorId ve reason ile use case\'i çağırır', async () => {
      // Arrange
      const req = { user: { id: 'admin-1' } };
      const body = { reason: 'Gecikme süresi aşıldı' };

      // Act
      await controller.reject('ref-1', body as any, req as any);

      // Assert
      expect(mockReject.execute).toHaveBeenCalledWith('ref-1', 'admin-1', 'Gecikme süresi aşıldı');
    });

    it('reason undefined geçilebilir', async () => {
      const req = { user: { id: 'admin-1' } };
      await controller.reject('ref-1', {} as any, req as any);
      expect(mockReject.execute).toHaveBeenCalledWith('ref-1', 'admin-1', undefined);
    });
  });
});
