/**
 * AuditLogService unit testleri.
 * Repository stub ile izole edilir.
 */
import { AuditLogService } from '../../src/application/services/AuditLogService';
import { IAuditLogRepository } from '../../src/domain/interfaces/IAuditLogRepository';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let mockRepo: jest.Mocked<IAuditLogRepository>;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn().mockResolvedValue({
        id: 'log-1',
        action: 'PURCHASE',
        entityType: 'Purchase',
        entityId: 'pur-1',
        actorId: 'user-1',
        metadata: {},
        createdAt: new Date(),
      }),
      list: jest.fn(),
    };
    service = new AuditLogService(mockRepo);
  });

  // --- log (generic) ---

  describe('log', () => {
    it('doğru parametrelerle repository.create çağırır', async () => {
      // Act
      await service.log('PURCHASE', 'Purchase', 'pur-1', {
        actorId: 'user-1',
        metadata: { orderId: 'ord-1' },
      });

      // Assert
      expect(mockRepo.create).toHaveBeenCalledWith({
        action: 'PURCHASE',
        entityType: 'Purchase',
        entityId: 'pur-1',
        actorId: 'user-1',
        metadata: { orderId: 'ord-1' },
      });
    });

    it('options belirtilmezse actorId null ve metadata boş nesne olur', async () => {
      // Act
      await service.log('PURCHASE', 'Purchase', 'pur-1');

      // Assert
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: null, metadata: {} }),
      );
    });
  });

  // --- logPurchase ---

  describe('logPurchase', () => {
    it('PURCHASE action ile log yazar', async () => {
      await service.logPurchase('Purchase', 'pur-1', { amount: 4900 }, 'cand-1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PURCHASE', entityId: 'pur-1', actorId: 'cand-1' }),
      );
    });
  });

  // --- logRefund ---

  describe('logRefund', () => {
    it('REFUND action ile log yazar', async () => {
      await service.logRefund('RefundRequest', 'ref-1', { reason: 'test' }, 'admin-1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REFUND', entityId: 'ref-1' }),
      );
    });
  });

  // --- logPriceChange ---

  describe('logPriceChange', () => {
    it('PRICE_CHANGE action ile eski ve yeni fiyatı metadata\'ya ekler', async () => {
      await service.logPriceChange('ExamTest', 'test-1', { oldPrice: 3000, newPrice: 4000 }, 'edu-1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PRICE_CHANGE',
          metadata: expect.objectContaining({ oldPrice: 3000, newPrice: 4000 }),
        }),
      );
    });
  });

  // --- logPublish / logUnpublish ---

  describe('logPublish / logUnpublish', () => {
    it('logPublish PUBLISH action yazar', async () => {
      await service.logPublish('ExamTest', 'test-1', 'edu-1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PUBLISH' }),
      );
    });

    it('logUnpublish UNPUBLISH action yazar', async () => {
      await service.logUnpublish('ExamTest', 'test-1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UNPUBLISH' }),
      );
    });
  });
});
