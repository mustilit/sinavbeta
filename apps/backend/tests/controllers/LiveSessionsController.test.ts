/**
 * LiveSessionsController unit testleri.
 * Her use-case'in doğru argümanlarla çağrıldığını doğrular.
 */
import { LiveSessionsController } from '../../src/nest/controllers/live-sessions.controller';

describe('LiveSessionsController', () => {
  let controller: LiveSessionsController;
  let mockCreateUC: { execute: jest.Mock };
  let mockStateUC: { execute: jest.Mock };
  let mockJoinUC: { execute: jest.Mock };
  let mockAnswerUC: { execute: jest.Mock };
  let mockStartUC: { execute: jest.Mock };
  let mockNavUC: { execute: jest.Mock };
  let mockToggleStatsUC: { execute: jest.Mock };
  let mockEndUC: { execute: jest.Mock };
  let mockPingUC: { execute: jest.Mock };
  let mockPayUC: { execute: jest.Mock };
  let mockListMyUC: { execute: jest.Mock };
  let mockListTiersUC: { execute: jest.Mock };
  let mockCreateTierUC: { execute: jest.Mock };
  let mockUpdateTierUC: { execute: jest.Mock };
  let mockDeleteTierUC: { execute: jest.Mock };
  let mockByCodeUC: { execute: jest.Mock };
  let mockRound2UC: { execute: jest.Mock };
  let mockComparisonUC: { execute: jest.Mock };

  const session = { id: 'ls-1', status: 'DRAFT', educatorId: 'edu-1' };
  const tier = { id: 'tier-1', label: 'Standart', maxParticipants: 50 };

  beforeEach(() => {
    mockCreateUC = { execute: jest.fn().mockResolvedValue(session) };
    mockStateUC = { execute: jest.fn().mockResolvedValue({ ...session, status: 'ACTIVE', currentQuestion: null }) };
    mockJoinUC = { execute: jest.fn().mockResolvedValue({ joined: true, participantId: 'p-1' }) };
    mockAnswerUC = { execute: jest.fn().mockResolvedValue({ saved: true }) };
    mockStartUC = { execute: jest.fn().mockResolvedValue({ ...session, status: 'ACTIVE' }) };
    mockNavUC = { execute: jest.fn().mockResolvedValue({ currentQuestionIdx: 1 }) };
    mockToggleStatsUC = { execute: jest.fn().mockResolvedValue({ showStats: true }) };
    mockEndUC = { execute: jest.fn().mockResolvedValue({ ...session, status: 'ENDED' }) };
    mockPingUC = { execute: jest.fn().mockResolvedValue({ ok: true }) };
    mockPayUC = { execute: jest.fn().mockResolvedValue({ paidAt: new Date() }) };
    mockListMyUC = { execute: jest.fn().mockResolvedValue([session]) };
    mockListTiersUC = { execute: jest.fn().mockResolvedValue([tier]) };
    mockCreateTierUC = { execute: jest.fn().mockResolvedValue(tier) };
    mockUpdateTierUC = { execute: jest.fn().mockResolvedValue({ ...tier, label: 'Premium' }) };
    mockDeleteTierUC = { execute: jest.fn().mockResolvedValue({ deleted: true }) };
    mockByCodeUC = { execute: jest.fn().mockResolvedValue({ ...session, joinCode: 'ABC123' }) };
    mockRound2UC = { execute: jest.fn().mockResolvedValue({ id: 'ls-2', parentSessionId: 'ls-1' }) };
    mockComparisonUC = { execute: jest.fn().mockResolvedValue({ comparison: [] }) };

    controller = new LiveSessionsController(
      mockCreateUC as any,
      mockStateUC as any,
      mockJoinUC as any,
      mockAnswerUC as any,
      mockStartUC as any,
      mockNavUC as any,
      mockToggleStatsUC as any,
      mockEndUC as any,
      mockPingUC as any,
      mockPayUC as any,
      mockListMyUC as any,
      mockListTiersUC as any,
      mockCreateTierUC as any,
      mockUpdateTierUC as any,
      mockDeleteTierUC as any,
      mockByCodeUC as any,
      mockRound2UC as any,
      mockComparisonUC as any,
    );
  });

  describe('listTiers', () => {
    it('aktif tier\'ları listeler', async () => {
      const result = await controller.listTiers();
      expect(mockListTiersUC.execute).toHaveBeenCalledWith(true);
      expect(result).toContainEqual(tier);
    });
  });

  describe('listAllTiers', () => {
    it('tüm tier\'ları listeler (admin)', async () => {
      await controller.listAllTiers();
      expect(mockListTiersUC.execute).toHaveBeenCalledWith(false);
    });
  });

  describe('createTier', () => {
    it('DTO\'dan oluşturulmuş nesne ile tier oluşturur', async () => {
      const dto = { label: 'Standart', minParticipants: 10, maxParticipants: 50, priceCents: 9900, isActive: true } as any;
      const result = await controller.createTier(dto);
      // Controller DTO'yu dönüştürerek execute'a iletir (isActive controller düzeyinde iletilmez)
      expect(mockCreateTierUC.execute).toHaveBeenCalledWith(
        expect.objectContaining({ label: 'Standart', maxParticipants: 50, priceCents: 9900 }),
      );
      expect(result).toHaveProperty('id', 'tier-1');
    });
  });

  describe('updateTier', () => {
    it('id ve DTO ile tier günceller', async () => {
      const dto = { label: 'Premium' } as any;
      const result = await controller.updateTier('tier-1', dto);
      expect(mockUpdateTierUC.execute).toHaveBeenCalledWith(expect.objectContaining({ id: 'tier-1', label: 'Premium' }));
      expect(result).toHaveProperty('label', 'Premium');
    });
  });

  describe('deleteTier', () => {
    it('id ile tier siler', async () => {
      await controller.deleteTier('tier-1');
      expect(mockDeleteTierUC.execute).toHaveBeenCalledWith('tier-1');
    });
  });

  describe('create', () => {
    it('educator oturum oluşturur', async () => {
      const dto = {
        tierId: 'tier-1',
        title: 'Matematik Sınavı',
        maxParticipants: 30,
        questions: [
          { content: 'Soru 1', mediaUrl: null, options: [{ content: 'A', mediaUrl: null, isCorrect: true }, { content: 'B', mediaUrl: null, isCorrect: false }] },
        ],
      } as any;
      const req = { user: { id: 'edu-1' } };
      const result = await controller.create(dto, req as any);
      expect(mockCreateUC.execute).toHaveBeenCalledWith(
        expect.objectContaining({ educatorId: 'edu-1', title: 'Matematik Sınavı' }),
      );
      expect(result).toHaveProperty('id', 'ls-1');
    });
  });

  describe('listMy', () => {
    it('educator\'ın oturumlarını listeler', async () => {
      const req = { user: { id: 'edu-1' } };
      const result = await controller.listMy(req as any, undefined, undefined, undefined, undefined);
      expect(mockListMyUC.execute).toHaveBeenCalledWith('edu-1', expect.any(Object));
    });
  });

  describe('pay', () => {
    it('oturum için ödeme yapar', async () => {
      const req = { user: { id: 'edu-1' } };
      // Controller imzası: pay(id, body, req) — body.promoCode opsiyonel
      const result = await controller.pay('ls-1', {}, req as any);
      expect(mockPayUC.execute).toHaveBeenCalledWith('ls-1', 'edu-1', undefined);
      expect(result).toHaveProperty('paidAt');
    });
  });

  describe('start', () => {
    it('oturumu aktive eder', async () => {
      const req = { user: { id: 'edu-1' } };
      const result = await controller.start('ls-1', req as any);
      expect(mockStartUC.execute).toHaveBeenCalledWith('ls-1', 'edu-1');
      expect(result).toHaveProperty('status', 'ACTIVE');
    });
  });

  describe('next / prev', () => {
    it('sonraki soruya geçer', async () => {
      const req = { user: { id: 'edu-1' } };
      await controller.next('ls-1', req as any);
      expect(mockNavUC.execute).toHaveBeenCalledWith('ls-1', 'edu-1', 'next');
    });

    it('önceki soruya döner', async () => {
      const req = { user: { id: 'edu-1' } };
      await controller.prev('ls-1', req as any);
      expect(mockNavUC.execute).toHaveBeenCalledWith('ls-1', 'edu-1', 'prev');
    });
  });

  describe('toggleStats', () => {
    it('istatistik gösterimini açar/kapar', async () => {
      const req = { user: { id: 'edu-1' } };
      const result = await controller.toggleStats('ls-1', req as any);
      expect(mockToggleStatsUC.execute).toHaveBeenCalledWith('ls-1', 'edu-1');
      expect(result).toHaveProperty('showStats', true);
    });
  });

  describe('end', () => {
    it('oturumu bitirir', async () => {
      const req = { user: { id: 'edu-1' } };
      const result = await controller.end('ls-1', req as any);
      expect(mockEndUC.execute).toHaveBeenCalledWith('ls-1', 'edu-1');
      expect(result).toHaveProperty('status', 'ENDED');
    });
  });

  describe('join', () => {
    it('katılım kodu ile oturuma katılır (büyük harf)', async () => {
      const req = { user: { id: 'cand-1' } };
      const result = await controller.join('abc123', req as any);
      // Controller join'e 3. arg olarak { ip } geçer (kapatma saldırısı limiti).
      expect(mockJoinUC.execute).toHaveBeenCalledWith('ABC123', 'cand-1', { ip: null });
      expect(result).toHaveProperty('joined', true);
    });
  });

  describe('ping', () => {
    it('heartbeat gönderir', async () => {
      const req = { user: { id: 'cand-1' } };
      await controller.ping('ls-1', req as any);
      expect(mockPingUC.execute).toHaveBeenCalledWith('ls-1', 'cand-1');
    });
  });

  describe('answer', () => {
    it('cevabı kaydeder', async () => {
      const body = { questionId: 'lq-1', optionId: 'lo-1' };
      const req = { user: { id: 'cand-1' } };
      await controller.answer('ls-1', body, req as any);
      expect(mockAnswerUC.execute).toHaveBeenCalledWith('ls-1', 'cand-1', 'lq-1', 'lo-1');
    });
  });

  describe('state', () => {
    it('oturum durumunu döndürür', async () => {
      const req = { user: { id: 'cand-1' } };
      const result = await controller.state('ls-1', req as any);
      expect(mockStateUC.execute).toHaveBeenCalledWith('ls-1', 'cand-1');
      expect(result).toHaveProperty('status', 'ACTIVE');
    });
  });

  describe('getByCode', () => {
    it('join kodu ile oturumu getirir (büyük harf)', async () => {
      const result = await controller.getByCode('abc123');
      expect(mockByCodeUC.execute).toHaveBeenCalledWith('ABC123');
      expect(result).toHaveProperty('joinCode', 'ABC123');
    });
  });

  describe('createRound2', () => {
    it('round 2 oturumu oluşturur', async () => {
      const req = { user: { id: 'edu-1' } };
      const result = await controller.createRound2('ls-1', req as any);
      expect(mockRound2UC.execute).toHaveBeenCalledWith('ls-1', 'edu-1');
      expect(result).toHaveProperty('parentSessionId', 'ls-1');
    });
  });

  describe('comparison', () => {
    it('karşılaştırma verilerini döndürür', async () => {
      const req = { user: { id: 'edu-1' } };
      const result = await controller.comparison('ls-1', req as any);
      expect(mockComparisonUC.execute).toHaveBeenCalledWith('ls-1', 'edu-1');
      expect(result).toHaveProperty('comparison');
    });
  });
});
