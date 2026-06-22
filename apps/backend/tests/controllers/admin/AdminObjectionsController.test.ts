/**
 * AdminObjectionsController unit testleri.
 */
import { AdminObjectionsController } from '../../../src/nest/controllers/admin.objections.controller';

describe('AdminObjectionsController', () => {
  let controller: AdminObjectionsController;
  let mockListEscalated: { execute: jest.Mock };
  let mockListAll: { execute: jest.Mock };
  let mockListStats: { execute: jest.Mock };
  let mockAdminAnswerUC: { execute: jest.Mock };
  let mockListAllContentReports: { execute: jest.Mock };
  let mockNoteContentReport: { execute: jest.Mock };

  const obj = { id: 'obj-1', status: 'ESCALATED', questionId: 'q-1', createdAt: new Date() };

  beforeEach(() => {
    mockListEscalated = { execute: jest.fn().mockResolvedValue([obj]) };
    mockListAll = { execute: jest.fn().mockResolvedValue([obj]) };
    mockListStats = { execute: jest.fn().mockResolvedValue([{ testId: 'test-1', count: 5 }]) };
    mockAdminAnswerUC = { execute: jest.fn().mockResolvedValue({ ...obj, adminAnswerText: 'Yanıt metni' }) };
    mockListAllContentReports = { execute: jest.fn().mockResolvedValue([]) };
    mockNoteContentReport = { execute: jest.fn().mockResolvedValue({ ok: true }) };
    controller = new AdminObjectionsController(
      mockListEscalated as any,
      mockListAll as any,
      mockListStats as any,
      mockAdminAnswerUC as any,
      mockListAllContentReports as any,
      mockNoteContentReport as any,
    );
  });

  describe('listEscalatedEndpoint', () => {
    it('eskalatlanmış itirazları listeler', async () => {
      const result = await controller.listEscalatedEndpoint({} as any);
      expect(mockListEscalated.execute).toHaveBeenCalledWith({});
    });

    it('tarih filtreleri Date nesnesine çevrilir', async () => {
      const q = { from: '2025-01-01', to: '2025-12-31' } as any;
      await controller.listEscalatedEndpoint(q);
      expect(mockListEscalated.execute).toHaveBeenCalledWith({
        from: expect.any(Date),
        to: expect.any(Date),
      });
    });
  });

  describe('listAllEndpoint', () => {
    it('tüm itirazları listeler', async () => {
      await controller.listAllEndpoint('PENDING', undefined, undefined);
      expect(mockListAll.execute).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING' }),
      );
    });

    it('boş status filtresi undefined iletilir', async () => {
      await controller.listAllEndpoint(undefined, undefined, undefined);
      expect(mockListAll.execute).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });
  });

  describe('testStats', () => {
    it('test raporlama istatistiklerini döndürür', async () => {
      const result = await controller.testStats();
      expect(mockListStats.execute).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('adminAnswer', () => {
    it('admin yanıtını kaydeder', async () => {
      const body = { adminAnswerText: 'Bu soru doğru.' } as any;
      const req = { user: { id: 'admin-1' } };
      const result = await controller.adminAnswer('obj-1', body, req as any);
      expect(mockAdminAnswerUC.execute).toHaveBeenCalledWith(
        { objectionId: 'obj-1', adminAnswerText: 'Bu soru doğru.' },
        'admin-1',
      );
      expect(result).toHaveProperty('adminAnswerText', 'Yanıt metni');
    });
  });
});
