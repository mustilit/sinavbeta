/**
 * PrismaRefundRepository unit testleri.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    refundRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    examTest: {
      findMany: jest.fn(),
    },
    purchase: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { PrismaRefundRepository } from '../../src/infrastructure/repositories/PrismaRefundRepository';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

const makeRefundRow = (overrides: Partial<any> = {}) => ({
  id: 'ref-1',
  purchaseId: 'pur-1',
  candidateId: 'cand-1',
  educatorId: 'edu-1',
  testId: 'test-1',
  reason: 'Not satisfied',
  description: null,
  status: 'PENDING',
  educatorDeadline: null,
  educatorDecidedAt: null,
  appealReason: null,
  appealedAt: null,
  decidedBy: null,
  decidedAt: null,
  adminNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PrismaRefundRepository', () => {
  let repo: PrismaRefundRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new PrismaRefundRepository();
  });

  // --- create ---

  describe('create', () => {
    it('iade talebi oluşturur ve domain nesnesini döner', async () => {
      // Arrange
      mock.refundRequest.create.mockResolvedValueOnce(makeRefundRow());

      // Act
      const result = await repo.create({
        purchaseId: 'pur-1',
        candidateId: 'cand-1',
        educatorId: 'edu-1',
        testId: 'test-1',
        reason: 'Not satisfied',
      });

      // Assert
      expect(result.id).toBe('ref-1');
      expect(result.status).toBe('PENDING');
      expect(mock.refundRequest.create).toHaveBeenCalledTimes(1);
    });
  });

  // --- findById ---

  describe('findById', () => {
    it('iade talebi bulunduğunda domain nesnesini döner', async () => {
      mock.refundRequest.findUnique.mockResolvedValueOnce(makeRefundRow());
      const result = await repo.findById('ref-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('ref-1');
    });

    it('iade talebi bulunamazsa null döner', async () => {
      mock.refundRequest.findUnique.mockResolvedValueOnce(null);
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // --- findByCandidateId ---

  describe('findByCandidateId', () => {
    it('aday iade taleplerini listeler ve test başlığını ekler', async () => {
      // Arrange
      mock.refundRequest.findMany.mockResolvedValueOnce([makeRefundRow()]);
      mock.examTest.findMany.mockResolvedValueOnce([{ id: 'test-1', title: 'Matematik' }]);

      // Act
      const result = await repo.findByCandidateId('cand-1');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].testTitle).toBe('Matematik');
    });

    it('iade talebi yoksa boş dizi döner', async () => {
      mock.refundRequest.findMany.mockResolvedValueOnce([]);
      const result = await repo.findByCandidateId('cand-1');
      expect(result).toEqual([]);
    });
  });

  // --- updateStatus ---

  describe('updateStatus', () => {
    it('durumu günceller ve domain nesnesini döner', async () => {
      // Arrange
      mock.refundRequest.update.mockResolvedValueOnce(makeRefundRow({ status: 'APPROVED', decidedBy: 'admin-1' }));

      // Act
      const result = await repo.updateStatus('ref-1', 'APPROVED', 'admin-1');

      // Assert
      expect(result.status).toBe('APPROVED');
      expect(result.decidedBy).toBe('admin-1');
    });
  });

  // --- approve ---

  describe('approve', () => {
    it('iade onaylanınca transaction ile purchase REFUNDED yapılır', async () => {
      // Arrange
      const refundRow = makeRefundRow();
      mock.refundRequest.findUnique.mockResolvedValueOnce(refundRow);
      const updatedRefund = makeRefundRow({ status: 'APPROVED', decidedBy: 'admin-1' });
      mock.$transaction.mockImplementationOnce(async (fn: Function) => {
        return fn({
          refundRequest: { update: jest.fn().mockResolvedValue(updatedRefund) },
          purchase: { update: jest.fn().mockResolvedValue({}) },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        });
      });

      // Act
      const now = new Date();
      const result = await repo.approve('ref-1', 'admin-1', now);

      // Assert
      expect(result.status).toBe('APPROVED');
      expect(mock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('iade talebi bulunamazsa hata fırlatır', async () => {
      mock.refundRequest.findUnique.mockResolvedValueOnce(null);
      await expect(repo.approve('nonexistent', 'admin-1', new Date())).rejects.toThrow('REFUND_NOT_FOUND');
    });
  });

  // --- escalateOverdue ---

  describe('escalateOverdue', () => {
    it('vadesi geçen iade taleplerini ESCALATED yapar ve sayıyı döner', async () => {
      // Arrange
      mock.refundRequest.updateMany.mockResolvedValueOnce({ count: 3 });

      // Act
      const result = await repo.escalateOverdue();

      // Assert
      expect(result).toBe(3);
      expect(mock.refundRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ESCALATED' },
        }),
      );
    });
  });
});
