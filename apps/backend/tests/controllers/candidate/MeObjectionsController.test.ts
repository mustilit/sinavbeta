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
  let mockListMyWrittenReports: { execute: jest.Mock };

  const obj = { id: 'obj-1', status: 'OPEN', questionId: 'q-1', createdAt: new Date('2026-06-10T00:00:00Z') };
  const tunnelReport = { id: 'r-1', status: 'OPEN', reason: 'x', source: 'TUNNEL', createdAt: new Date('2026-06-12T00:00:00Z') };
  const writtenReport = { id: 'w-1', status: 'OPEN', reason: 'y', source: 'WRITTEN', createdAt: new Date('2026-06-14T00:00:00Z') };

  beforeEach(() => {
    mockListMyObjections = { execute: jest.fn().mockResolvedValue([obj]) };
    mockListMyTunnelReports = { execute: jest.fn().mockResolvedValue([tunnelReport]) };
    mockListMyWrittenReports = { execute: jest.fn().mockResolvedValue([writtenReport]) };
    controller = new MeObjectionsController(
      mockListMyObjections as any,
      mockListMyTunnelReports as any,
      mockListMyWrittenReports as any,
    );
  });

  describe('getMyObjections', () => {
    it('üç kaynağı (itiraz + tünel + yazılı) birleştirip createdAt desc sıralar', async () => {
      const req = { user: { id: 'cand-1' } };
      const result = await controller.getMyObjections(req as any);
      expect(mockListMyObjections.execute).toHaveBeenCalledWith('cand-1', { status: undefined });
      expect(mockListMyTunnelReports.execute).toHaveBeenCalledWith('cand-1', { status: undefined });
      expect(mockListMyWrittenReports.execute).toHaveBeenCalledWith('cand-1', { status: undefined });
      expect(result).toHaveLength(3);
      // writtenReport (06-14) → tunnelReport (06-12) → obj (06-10)
      expect(result.map((r: any) => r.id)).toEqual(['w-1', 'r-1', 'obj-1']);
    });

    it('status filtresiyle üç kaynağı da sorgular', async () => {
      const req = { user: { id: 'cand-1' } };
      await controller.getMyObjections(req as any, 'OPEN');
      expect(mockListMyObjections.execute).toHaveBeenCalledWith('cand-1', { status: 'OPEN' });
      expect(mockListMyTunnelReports.execute).toHaveBeenCalledWith('cand-1', { status: 'OPEN' });
      expect(mockListMyWrittenReports.execute).toHaveBeenCalledWith('cand-1', { status: 'OPEN' });
    });
  });
});
