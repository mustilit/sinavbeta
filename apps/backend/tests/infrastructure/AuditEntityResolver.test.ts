/**
 * AuditEntityResolver unit testleri.
 * Batch query davranışını ve N+1 önleme stratejisini doğrular.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    testPackage: { findMany: jest.fn() },
    examTest: { findMany: jest.fn() },
    testAttempt: { findMany: jest.fn() },
    purchase: { findMany: jest.fn() },
    tunnelPurchase: { findMany: jest.fn() },
    writtenPurchase: { findMany: jest.fn() },
    writtenPackage: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));

jest.mock('../../src/common/tenantContext', () => ({
  runWithoutTenantFilter: jest.fn().mockImplementation((fn: Function) => fn()),
}));

import { resolveAuditEntities } from '../../src/application/services/AuditEntityResolver';
import { prisma } from '../../src/infrastructure/database/prisma';

const mock = prisma as any;

describe('resolveAuditEntities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Temel çözümleme ---

  describe('TestPackage entity', () => {
    it('TestPackage id\'leri label ve link ile çözümlenir', async () => {
      // Arrange
      mock.testPackage.findMany.mockResolvedValueOnce([
        { id: 'pkg-1', title: 'Matematik Paketi' },
      ]);

      // Act
      const result = await resolveAuditEntities([
        { entityType: 'TestPackage', entityId: 'pkg-1' },
      ]);

      // Assert
      const resolved = result.get('TestPackage::pkg-1');
      expect(resolved).toBeDefined();
      expect(resolved!.label).toBe('Matematik Paketi');
      expect(resolved!.link).toBe('/TestDetail?id=pkg-1');
    });
  });

  describe('User entity', () => {
    it('User id\'leri username ve rol ile çözümlenir', async () => {
      // Arrange
      mock.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', username: 'ahmet', email: 'ahmet@x.com', role: 'CANDIDATE' },
      ]);

      // Act
      const result = await resolveAuditEntities([
        { entityType: 'User', entityId: 'user-1' },
      ]);

      // Assert
      const resolved = result.get('User::user-1');
      expect(resolved!.label).toBe('ahmet (CANDIDATE)');
      expect(resolved!.link).toBeNull();
    });
  });

  describe('Purchase entity', () => {
    it('Purchase id\'leri paket adı ve tutar ile çözümlenir', async () => {
      // Arrange
      mock.purchase.findMany.mockResolvedValueOnce([
        {
          id: 'pur-1',
          amountCents: 4900,
          package: { id: 'pkg-1', title: 'Fizik Paketi' },
        },
      ]);

      // Act
      const result = await resolveAuditEntities([
        { entityType: 'Purchase', entityId: 'pur-1' },
      ]);

      // Assert
      const resolved = result.get('Purchase::pur-1');
      expect(resolved!.label).toContain('Fizik Paketi');
      expect(resolved!.label).toContain('₺49.00');
      expect(resolved!.link).toBe('/TestDetail?id=pkg-1');
    });
  });

  describe('TunnelPurchase entity', () => {
    it('TunnelPurchase id\'leri tünel adı + tutar + TunnelDetail link ile çözümlenir', async () => {
      mock.tunnelPurchase.findMany.mockResolvedValueOnce([
        { id: 'tp-1', amountCents: 7500, tunnel: { id: 'tn-1', title: 'Paragraf Tüneli' } },
      ]);
      const result = await resolveAuditEntities([{ entityType: 'TunnelPurchase', entityId: 'tp-1' }]);
      const resolved = result.get('TunnelPurchase::tp-1');
      expect(resolved!.label).toContain('Tünel');
      expect(resolved!.label).toContain('Paragraf Tüneli');
      expect(resolved!.label).toContain('₺75.00');
      expect(resolved!.link).toBe('/TunnelDetail?id=tn-1');
    });
  });

  describe('WrittenPurchase entity', () => {
    it('WrittenPurchase id\'leri yazılı paket adı + tutar + WrittenTestDetail link ile çözümlenir', async () => {
      mock.writtenPurchase.findMany.mockResolvedValueOnce([
        { id: 'wp-1', amountCents: 12000, packageId: 'wpk-1' },
      ]);
      mock.writtenPackage.findMany.mockResolvedValueOnce([{ id: 'wpk-1', title: 'Kompozisyon Seti' }]);
      const result = await resolveAuditEntities([{ entityType: 'WrittenPurchase', entityId: 'wp-1' }]);
      const resolved = result.get('WrittenPurchase::wp-1');
      expect(resolved!.label).toContain('Yazılı');
      expect(resolved!.label).toContain('Kompozisyon Seti');
      expect(resolved!.label).toContain('₺120.00');
      expect(resolved!.link).toBe('/WrittenTestDetail?id=wpk-1');
    });
  });

  // --- Batch query (N+1 koruması) ---

  describe('batch query', () => {
    it('aynı tip için tek findMany çağrısı yapılır', async () => {
      // Arrange — 3 farklı TestPackage ID
      mock.testPackage.findMany.mockResolvedValueOnce([
        { id: 'pkg-1', title: 'Paket 1' },
        { id: 'pkg-2', title: 'Paket 2' },
        { id: 'pkg-3', title: 'Paket 3' },
      ]);

      // Act
      await resolveAuditEntities([
        { entityType: 'TestPackage', entityId: 'pkg-1' },
        { entityType: 'TestPackage', entityId: 'pkg-2' },
        { entityType: 'TestPackage', entityId: 'pkg-3' },
      ]);

      // Assert — sadece 1 findMany çağrısı
      expect(mock.testPackage.findMany).toHaveBeenCalledTimes(1);
      expect(mock.testPackage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: expect.arrayContaining(['pkg-1', 'pkg-2', 'pkg-3']) } },
        }),
      );
    });

    it('birden fazla tip için her tip için ayrı query yapılır', async () => {
      // Arrange
      mock.testPackage.findMany.mockResolvedValueOnce([{ id: 'pkg-1', title: 'Paket' }]);
      mock.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', username: 'u1', email: 'u1@x.com', role: 'ADMIN' },
      ]);

      // Act
      await resolveAuditEntities([
        { entityType: 'TestPackage', entityId: 'pkg-1' },
        { entityType: 'User', entityId: 'user-1' },
      ]);

      // Assert
      expect(mock.testPackage.findMany).toHaveBeenCalledTimes(1);
      expect(mock.user.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // --- Edge case'ler ---

  describe('edge case\'ler', () => {
    it('boş liste ile çağrıldığında boş Map döner', async () => {
      const result = await resolveAuditEntities([]);
      expect(result.size).toBe(0);
    });

    it('entityType null/undefined olan kayıtlar atlanır', async () => {
      const result = await resolveAuditEntities([
        { entityType: null, entityId: 'some-id' },
        { entityType: undefined, entityId: 'other-id' },
      ]);
      expect(result.size).toBe(0);
    });

    it('bilinmeyen entityType için Map\'te kayıt oluşmaz', async () => {
      const result = await resolveAuditEntities([
        { entityType: 'UnknownEntity', entityId: 'some-id' },
      ]);
      expect(result.has('UnknownEntity::some-id')).toBe(false);
    });

    it('silinmiş/bulunamayan entity için Map\'te kayıt oluşmaz', async () => {
      mock.testPackage.findMany.mockResolvedValueOnce([]); // bulunamadı
      const result = await resolveAuditEntities([
        { entityType: 'TestPackage', entityId: 'deleted-pkg' },
      ]);
      expect(result.has('TestPackage::deleted-pkg')).toBe(false);
    });
  });
});
