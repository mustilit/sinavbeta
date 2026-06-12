/**
 * RevokeUserDeviceUseCase testleri
 *
 * Davranışlar:
 * - Geçerli userId + kendi cihazı → trusted=false, trustToken=null, ok:true döner
 * - Audit log oluşturulur (best-effort)
 * - Başkasının cihazı verilirse → NotFoundException (DEVICE_NOT_FOUND)
 * - Cihaz hiç yoksa → NotFoundException (DEVICE_NOT_FOUND)
 * - userId yoksa → ForbiddenException (UNAUTHENTICATED)
 * - Audit başarısız olsa bile revoke tamamlanır (best-effort)
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    userDevice: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

// PrismaAuditLogRepository prisma'yı içeriden kullanır, mock'ladık
jest.mock('../../../src/infrastructure/repositories/PrismaAuditLogRepository', () => ({
  PrismaAuditLogRepository: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RevokeUserDeviceUseCase } from '../../../src/application/use-cases/auth/RevokeUserDeviceUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

const DEVICE = {
  id: 'dev-1',
  userId: 'u1',
  userAgent: 'Chrome',
  ip: '1.2.3.4',
  trusted: true,
  trustToken: 'tok-abc',
  trustTokenExpiresAt: new Date(Date.now() + 3600_000),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.userDevice.update.mockResolvedValue({ ...DEVICE, trusted: false, trustToken: null });
});

describe('RevokeUserDeviceUseCase', () => {
  describe('başarılı revoke', () => {
    it('kendi cihazını revoke eder ve ok:true döner', async () => {
      mockPrisma.userDevice.findUnique.mockResolvedValue(DEVICE);
      const uc = new RevokeUserDeviceUseCase();

      const result = await uc.execute('u1', 'dev-1');

      expect(result).toEqual({ ok: true });
    });

    it('userDevice.update trusted=false, trustToken=null ile çağrılır', async () => {
      mockPrisma.userDevice.findUnique.mockResolvedValue(DEVICE);
      const uc = new RevokeUserDeviceUseCase();

      await uc.execute('u1', 'dev-1');

      expect(mockPrisma.userDevice.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: { trusted: false, trustToken: null, trustTokenExpiresAt: null },
      });
    });

    it('ctx (ip, userAgent) verilince hata fırlatmaz', async () => {
      mockPrisma.userDevice.findUnique.mockResolvedValue(DEVICE);
      const uc = new RevokeUserDeviceUseCase();

      await expect(
        uc.execute('u1', 'dev-1', { ip: '10.0.0.1', userAgent: 'Safari' }),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('yetki hataları', () => {
    it('userId boşsa ForbiddenException (UNAUTHENTICATED) fırlatır', async () => {
      const uc = new RevokeUserDeviceUseCase();

      await expect(uc.execute('', 'dev-1')).rejects.toThrow(ForbiddenException);
    });

    it('cihaz başka kullanıcıya aitse NotFoundException (DEVICE_NOT_FOUND) fırlatır', async () => {
      mockPrisma.userDevice.findUnique.mockResolvedValue({ ...DEVICE, userId: 'other-user' });
      const uc = new RevokeUserDeviceUseCase();

      await expect(uc.execute('u1', 'dev-1')).rejects.toThrow(NotFoundException);
    });

    it('cihaz hiç yoksa NotFoundException (DEVICE_NOT_FOUND) fırlatır', async () => {
      mockPrisma.userDevice.findUnique.mockResolvedValue(null);
      const uc = new RevokeUserDeviceUseCase();

      await expect(uc.execute('u1', 'no-such-device')).rejects.toThrow(NotFoundException);
    });

    it('hata kodu DEVICE_NOT_FOUND içerir (başkasının cihazı)', async () => {
      mockPrisma.userDevice.findUnique.mockResolvedValue({ ...DEVICE, userId: 'someone-else' });
      const uc = new RevokeUserDeviceUseCase();

      await expect(uc.execute('u1', 'dev-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DEVICE_NOT_FOUND' }),
      });
    });
  });

  describe('audit best-effort', () => {
    it('update başarılı ama audit başarısız olsa bile ok:true döner', async () => {
      const { PrismaAuditLogRepository } = require('../../../src/infrastructure/repositories/PrismaAuditLogRepository');
      PrismaAuditLogRepository.mockImplementationOnce(() => ({
        create: jest.fn().mockRejectedValue(new Error('AUDIT_DB_FAIL')),
      }));

      mockPrisma.userDevice.findUnique.mockResolvedValue(DEVICE);
      const uc = new RevokeUserDeviceUseCase();

      const result = await uc.execute('u1', 'dev-1');

      expect(result).toEqual({ ok: true });
    });
  });
});
