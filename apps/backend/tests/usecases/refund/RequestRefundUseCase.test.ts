/**
 * RequestRefundUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - actorId eksik → UNAUTHORIZED
 * - Geçersiz UUID purchaseId → INVALID_UUID
 * - Purchase bulunamaz → PURCHASE_NOT_FOUND
 * - Purchase sahibi değilse → FORBIDDEN_NOT_OWNER
 * - 7 günlük iade penceresi dolduysa → REFUND_WINDOW_EXPIRED
 * - Attempt başlatılmışsa → REFUND_NOT_ALLOWED_ATTEMPT_STARTED
 * - Aynı purchase için ikinci talep → REFUND_ALREADY_REQUESTED
 * - reason < 5 karakter → REASON_TOO_SHORT
 * - Başarı: iade kaydı oluşturulur, educatorId atanır, audit log çağrılır
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    examTest: { findMany: jest.fn(), findUnique: jest.fn() },
    testAttempt: { count: jest.fn() },
    tunnelPurchase: { findUnique: jest.fn() },
    tunnel: { findUnique: jest.fn() },
    tunnelAttempt: { count: jest.fn() },
    writtenPurchase: { findUnique: jest.fn() },
    writtenTest: { findMany: jest.fn() },
    writtenAttempt: { count: jest.fn() },
    writtenPackage: { findUnique: jest.fn() },
  },
}));

import { RequestRefundUseCase } from '../../../src/application/use-cases/refund/RequestRefundUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { AppError } from '../../../src/application/errors/AppError';

const mockPrisma = prisma as any;

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function makePurchase(overrides: Record<string, any> = {}) {
  return {
    id: VALID_UUID,
    candidateId: 'cand-1',
    testId: 'test-1',
    packageId: null,
    createdAt: new Date(), // fresh purchase — within window
    ...overrides,
  };
}

function makeRepos(purchaseOverride?: any) {
  const purchase = purchaseOverride ?? makePurchase();
  const purchaseRepo = {
    findById: jest.fn().mockResolvedValue(purchase),
  };
  const refundRepo = {
    findByPurchaseId: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({
      id: 'ref-1',
      purchaseId: VALID_UUID,
      candidateId: 'cand-1',
      educatorId: 'edu-1',
      testId: 'test-1',
      reason: null,
      status: 'PENDING',
      educatorDeadline: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }),
  };
  const attemptRepo = {};
  const auditRepo = {
    create: jest.fn().mockResolvedValue({}),
  };
  return { purchaseRepo, refundRepo, attemptRepo, auditRepo };
}

describe('RequestRefundUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.examTest.findMany.mockResolvedValue([]);
    mockPrisma.testAttempt.count.mockResolvedValue(0);
    mockPrisma.examTest.findUnique.mockResolvedValue({ educatorId: 'edu-1' });
  });

  it('actorId eksik ise UNAUTHORIZED fırlatır', async () => {
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos();
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );
    await expect(
      uc.execute({ purchaseId: VALID_UUID }, undefined),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('geçersiz UUID formatı ise INVALID_UUID fırlatır', async () => {
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos();
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );
    await expect(
      uc.execute({ purchaseId: 'not-a-uuid' }, 'cand-1'),
    ).rejects.toMatchObject({ code: 'INVALID_UUID' });
  });

  it('purchase bulunamazsa PURCHASE_NOT_FOUND fırlatır', async () => {
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos();
    purchaseRepo.findById.mockResolvedValue(null);
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );
    await expect(
      uc.execute({ purchaseId: VALID_UUID }, 'cand-1'),
    ).rejects.toMatchObject({ code: 'PURCHASE_NOT_FOUND' });
  });

  it('purchase sahibi başka kullanıcıysa FORBIDDEN_NOT_OWNER fırlatır', async () => {
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos(
      makePurchase({ candidateId: 'other-cand' }),
    );
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );
    await expect(
      uc.execute({ purchaseId: VALID_UUID }, 'cand-1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('7 günlük pencere geçtiyse REFUND_WINDOW_EXPIRED fırlatır', async () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 gün önce
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos(
      makePurchase({ createdAt: oldDate }),
    );
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );
    await expect(
      uc.execute({ purchaseId: VALID_UUID }, 'cand-1'),
    ).rejects.toMatchObject({ code: 'REFUND_WINDOW_EXPIRED' });
  });

  it('attempt başlatılmışsa REFUND_NOT_ALLOWED_ATTEMPT_STARTED fırlatır', async () => {
    mockPrisma.testAttempt.count.mockResolvedValue(1);
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos();
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );
    await expect(
      uc.execute({ purchaseId: VALID_UUID }, 'cand-1'),
    ).rejects.toMatchObject({ code: 'REFUND_NOT_ALLOWED_ATTEMPT_STARTED' });
  });

  it('aynı purchase için ikinci talep REFUND_ALREADY_REQUESTED fırlatır', async () => {
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos();
    refundRepo.findByPurchaseId.mockResolvedValue({ id: 'ref-existing', status: 'PENDING' });
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );
    await expect(
      uc.execute({ purchaseId: VALID_UUID }, 'cand-1'),
    ).rejects.toMatchObject({ code: 'REFUND_ALREADY_REQUESTED' });
  });

  it('reason 4 karakter ise REASON_TOO_SHORT fırlatır', async () => {
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos();
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );
    await expect(
      uc.execute({ purchaseId: VALID_UUID, reason: 'kısa' }, 'cand-1'),
    ).rejects.toMatchObject({ code: 'REASON_TOO_SHORT' });
  });

  it('başarı: refundRepo.create çağrılır, educatorId atanır, audit log yazılır', async () => {
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos();
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );

    const result = await uc.execute({ purchaseId: VALID_UUID, reason: 'Uzun gerekçe metni' }, 'cand-1');

    expect(refundRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseId: VALID_UUID, educatorId: 'edu-1' }),
    );
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFUND_REQUESTED' }),
    );
    expect(result.id).toBe('ref-1');
  });

  it('audit log hatası main flow u kesmez', async () => {
    const { purchaseRepo, refundRepo, attemptRepo, auditRepo } = makeRepos();
    auditRepo.create.mockRejectedValue(new Error('AUDIT_FAIL'));
    const uc = new RequestRefundUseCase(
      refundRepo as any,
      purchaseRepo as any,
      attemptRepo as any,
      auditRepo as any,
    );

    const result = await uc.execute({ purchaseId: VALID_UUID }, 'cand-1');
    expect(result.id).toBe('ref-1'); // başarıyla döner
  });

  // ── TUNNEL kaynaklı iade ──────────────────────────────────────────
  describe('source=TUNNEL', () => {
    function makeTunnelRepos() {
      const refundRepo = {
        findBySourcePurchaseId: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'ref-tun', source: 'TUNNEL', tunnelPurchaseId: VALID_UUID, candidateId: 'cand-1',
          educatorId: 'edu-1', testId: null, reason: null, status: 'PENDING',
          educatorDeadline: new Date().toISOString(), createdAt: new Date().toISOString(),
        }),
      };
      return { refundRepo, auditRepo: { create: jest.fn().mockResolvedValue({}) } };
    }

    beforeEach(() => {
      mockPrisma.tunnelPurchase.findUnique.mockResolvedValue({ id: VALID_UUID, candidateId: 'cand-1', tunnelId: 'tun-1', status: 'ACTIVE', createdAt: new Date() });
      mockPrisma.tunnelAttempt.count.mockResolvedValue(0);
      mockPrisma.tunnel.findUnique.mockResolvedValue({ educatorId: 'edu-1' });
    });

    it('başarı: TUNNEL iade kaydı oluşturulur (source + tunnelPurchaseId)', async () => {
      const { refundRepo, auditRepo } = makeTunnelRepos();
      const uc = new RequestRefundUseCase(refundRepo as any, {} as any, {} as any, auditRepo as any);
      const result = await uc.execute({ purchaseId: VALID_UUID, source: 'TUNNEL' }, 'cand-1');
      expect(refundRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'TUNNEL', tunnelPurchaseId: VALID_UUID, tunnelId: 'tun-1', educatorId: 'edu-1' }),
      );
      expect(result.source).toBe('TUNNEL');
    });

    it('tünel çözülmeye başlandıysa REFUND_NOT_ALLOWED_ATTEMPT_STARTED', async () => {
      mockPrisma.tunnelAttempt.count.mockResolvedValue(1);
      const { refundRepo, auditRepo } = makeTunnelRepos();
      const uc = new RequestRefundUseCase(refundRepo as any, {} as any, {} as any, auditRepo as any);
      await expect(uc.execute({ purchaseId: VALID_UUID, source: 'TUNNEL' }, 'cand-1'))
        .rejects.toMatchObject({ code: 'REFUND_NOT_ALLOWED_ATTEMPT_STARTED' });
    });

    it('sahibi değilse FORBIDDEN_NOT_OWNER', async () => {
      mockPrisma.tunnelPurchase.findUnique.mockResolvedValue({ id: VALID_UUID, candidateId: 'other', tunnelId: 'tun-1', status: 'ACTIVE', createdAt: new Date() });
      const { refundRepo, auditRepo } = makeTunnelRepos();
      const uc = new RequestRefundUseCase(refundRepo as any, {} as any, {} as any, auditRepo as any);
      await expect(uc.execute({ purchaseId: VALID_UUID, source: 'TUNNEL' }, 'cand-1'))
        .rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
    });

    it('aynı tünel satın alması için ikinci talep REFUND_ALREADY_REQUESTED', async () => {
      const { refundRepo, auditRepo } = makeTunnelRepos();
      refundRepo.findBySourcePurchaseId.mockResolvedValue({ id: 'existing' });
      const uc = new RequestRefundUseCase(refundRepo as any, {} as any, {} as any, auditRepo as any);
      await expect(uc.execute({ purchaseId: VALID_UUID, source: 'TUNNEL' }, 'cand-1'))
        .rejects.toMatchObject({ code: 'REFUND_ALREADY_REQUESTED' });
    });
  });

  // ── WRITTEN kaynaklı iade ─────────────────────────────────────────
  describe('source=WRITTEN', () => {
    function makeWrittenRepos() {
      const refundRepo = {
        findBySourcePurchaseId: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'ref-wr', source: 'WRITTEN', writtenPurchaseId: VALID_UUID, candidateId: 'cand-1',
          educatorId: 'edu-2', testId: null, reason: null, status: 'PENDING',
          educatorDeadline: new Date().toISOString(), createdAt: new Date().toISOString(),
        }),
      };
      return { refundRepo, auditRepo: { create: jest.fn().mockResolvedValue({}) } };
    }

    beforeEach(() => {
      mockPrisma.writtenPurchase.findUnique.mockResolvedValue({ id: VALID_UUID, candidateId: 'cand-1', packageId: 'wpkg-1', status: 'ACTIVE', createdAt: new Date() });
      mockPrisma.writtenTest.findMany.mockResolvedValue([{ id: 'wt-1' }]);
      mockPrisma.writtenAttempt.count.mockResolvedValue(0);
      mockPrisma.writtenPackage.findUnique.mockResolvedValue({ educatorId: 'edu-2' });
    });

    it('başarı: WRITTEN iade kaydı oluşturulur (source + writtenPurchaseId)', async () => {
      const { refundRepo, auditRepo } = makeWrittenRepos();
      const uc = new RequestRefundUseCase(refundRepo as any, {} as any, {} as any, auditRepo as any);
      const result = await uc.execute({ purchaseId: VALID_UUID, source: 'WRITTEN' }, 'cand-1');
      expect(refundRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'WRITTEN', writtenPurchaseId: VALID_UUID, writtenPackageId: 'wpkg-1', educatorId: 'edu-2' }),
      );
      expect(result.source).toBe('WRITTEN');
    });

    it('paketteki teste başlandıysa REFUND_NOT_ALLOWED_ATTEMPT_STARTED', async () => {
      mockPrisma.writtenAttempt.count.mockResolvedValue(1);
      const { refundRepo, auditRepo } = makeWrittenRepos();
      const uc = new RequestRefundUseCase(refundRepo as any, {} as any, {} as any, auditRepo as any);
      await expect(uc.execute({ purchaseId: VALID_UUID, source: 'WRITTEN' }, 'cand-1'))
        .rejects.toMatchObject({ code: 'REFUND_NOT_ALLOWED_ATTEMPT_STARTED' });
    });
  });
});
