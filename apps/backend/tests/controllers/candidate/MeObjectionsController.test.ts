/**
 * MeObjectionsController unit testleri.
 * Controller artık iki kaynağı birleştirir: aday itirazları (Objection) +
 * tünel soru hata bildirimleri (TunnelQuestionReport), createdAt'e göre azalan sırada.
 */
import { MeObjectionsController } from '../../../src/nest/controllers/me.objections.controller';

describe('MeObjectionsController', () => {
  let controller: MeObjectionsController;
  let mockListMyObjections: { execute: jest.Mock };
  let mockListMyTunnelReports: { execute: jest.Mock };

  const obj = { id: 'obj-1', status: 'OPEN', questionId: 'q-1', createdAt: new Date('2026-06-10T00:00:00Z') };
  const tunnelReport = { id: 'r-1', status: 'OPEN', reason: 'x', source: 'TUNNEL', createdAt: new Date('2026-06-12T00:00:00Z') };

  beforeEach(() => {
    mockListMyObjections = { execute: jest.fn().mockResolvedValue([obj]) };
    mockListMyTunnelReports = { execute: jest.fn().mockResolvedValue([tunnelReport]) };
    controller = new MeObjectionsController(mockListMyObjections as any, mockListMyTunnelReports as any);
  });

  describe('getMyObjections', () => {
    it('aday itirazları + tünel raporlarını birleştirip createdAt desc sıralar', async () => {
      const req = { user: { id: 'cand-1' } };
      const result = await controller.getMyObjections(req as any);
      expect(mockListMyObjections.execute).toHaveBeenCalledWith('cand-1', { status: undefined });
      expect(mockListMyTunnelReports.execute).toHaveBeenCalledWith('cand-1', { status: undefined });
      expect(result).toHaveLength(2);
      // tunnelReport (06-12) daha yeni → önce; obj (06-10) → sonra
      expect(result[0].id).toBe('r-1');
      expect(result[1].id).toBe('obj-1');
    });

    it('status filtresiyle her iki kaynağı da sorgular', async () => {
      const req = { user: { id: 'cand-1' } };
      await controller.getMyObjections(req as any, 'OPEN');
      expect(mockListMyObjections.execute).toHaveBeenCalledWith('cand-1', { status: 'OPEN' });
      expect(mockListMyTunnelReports.execute).toHaveBeenCalledWith('cand-1', { status: 'OPEN' });
    });
  });
});
