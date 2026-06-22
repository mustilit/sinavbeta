/**
 * EducatorObjectionsController unit testleri.
 */
import { EducatorObjectionsController } from '../../../src/nest/controllers/educator-objections.controller';

describe('EducatorObjectionsController', () => {
  let controller: EducatorObjectionsController;
  let mockAnswerObjection: { execute: jest.Mock };
  let mockListObjections: { execute: jest.Mock };
  let mockListContentReports: { execute: jest.Mock };
  let mockAnswerContentReport: { execute: jest.Mock };

  const obj = { id: 'obj-1', status: 'PENDING', questionId: 'q-1', createdAt: new Date() };

  beforeEach(() => {
    mockAnswerObjection = { execute: jest.fn().mockResolvedValue({ ...obj, status: 'ANSWERED', answerText: 'Doğru cevap B' }) };
    mockListObjections = { execute: jest.fn().mockResolvedValue([obj]) };
    mockListContentReports = { execute: jest.fn().mockResolvedValue([]) };
    mockAnswerContentReport = { execute: jest.fn().mockResolvedValue({ ok: true }) };
    controller = new EducatorObjectionsController(
      mockAnswerObjection as any,
      mockListObjections as any,
      mockListContentReports as any,
      mockAnswerContentReport as any,
    );
  });

  describe('list', () => {
    it('eğiticinin itirazlarını listeler', async () => {
      const req = { user: { id: 'edu-1' } };
      const result = await controller.list(req as any);
      expect(mockListObjections.execute).toHaveBeenCalledWith('edu-1', undefined);
      expect(result).toBeInstanceOf(Array);
    });

    it('status filtresiyle sorgular', async () => {
      const req = { user: { id: 'edu-1' } };
      await controller.list(req as any, 'PENDING');
      expect(mockListObjections.execute).toHaveBeenCalledWith('edu-1', { status: 'PENDING' });
    });
  });

  describe('answer', () => {
    it('itirazı yanıtlar', async () => {
      const body = { answerText: 'Doğru cevap B' } as any;
      const req = { user: { id: 'edu-1' } };
      const result = await controller.answer('obj-1', body, req as any);
      expect(mockAnswerObjection.execute).toHaveBeenCalledWith(
        { objectionId: 'obj-1', answerText: 'Doğru cevap B' },
        'edu-1',
      );
      expect(result).toHaveProperty('status', 'ANSWERED');
    });
  });
});
