/**
 * ProviderRegistry unit testleri.
 * Prisma mock'u ve decryptJson mock'u ile izole edilir.
 */
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {},
}));

jest.mock('../../src/application/services/email/utils/encryption', () => ({
  decryptJson: jest.fn(),
  encryptJson: jest.fn(),
}));

// EMAIL_SECRETS_KEY şifrelemesiz test için set et
process.env.EMAIL_SECRETS_KEY = 'a'.repeat(64);

import { ProviderRegistry } from '../../src/application/services/email/providers/ProviderRegistry';
import { decryptJson } from '../../src/application/services/email/utils/encryption';

const mockDecryptJson = decryptJson as jest.Mock;

const makeProviderConfig = (overrides: Partial<any> = {}) => ({
  id: 'prov-1',
  tenantId: 'tenant-1',
  name: 'Brevo Primary',
  kind: 'BREVO_API',
  priority: 1,
  isActive: true,
  fromEmail: 'no-reply@example.com',
  fromName: 'Sinav Salonu',
  encryptedSecrets: 'encrypted-payload',
  dailyCap: null,
  dailySentCount: 0,
  updatedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      emailProviderConfig: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    registry = new ProviderRegistry(mockDb);
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  // --- listActive ---

  describe('listActive', () => {
    it('aktif BREVO_API sağlayıcısını listeler', async () => {
      // Arrange
      mockDb.emailProviderConfig.findMany.mockResolvedValueOnce([makeProviderConfig()]);
      mockDecryptJson.mockReturnValueOnce({ apiKey: 'brevo-key-123' });

      // Act
      const result = await registry.listActive('tenant-1');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].config.kind).toBe('BREVO_API');
    });

    it('günlük cap dolmuş sağlayıcıyı atlar', async () => {
      // Arrange
      const capFull = makeProviderConfig({ dailyCap: 300, dailySentCount: 300 });
      mockDb.emailProviderConfig.findMany.mockResolvedValueOnce([capFull]);

      // Act
      const result = await registry.listActive('tenant-1');

      // Assert
      expect(result).toHaveLength(0);
    });

    it('CONSOLE sağlayıcısı production\'da atlanır', async () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      const consoleProv = makeProviderConfig({ kind: 'CONSOLE' });
      mockDb.emailProviderConfig.findMany.mockResolvedValueOnce([consoleProv]);

      // Act
      await registry.listActive('tenant-1');

      // Assert
      expect(mockDb.emailProviderConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ NOT: { kind: 'CONSOLE' } }),
        }),
      );
    });

    it('secret çözümleme hatası olan sağlayıcı atlanır', async () => {
      // Arrange
      mockDb.emailProviderConfig.findMany.mockResolvedValueOnce([makeProviderConfig()]);
      mockDecryptJson.mockImplementationOnce(() => { throw new Error('Decrypt failed'); });

      // Act
      const result = await registry.listActive('tenant-1');

      // Assert
      expect(result).toHaveLength(0);
    });

    it('birden fazla sağlayıcı priority sırasıyla döner', async () => {
      // Arrange
      const p1 = makeProviderConfig({ id: 'p1', priority: 1 });
      const p2 = makeProviderConfig({ id: 'p2', priority: 2 });
      mockDb.emailProviderConfig.findMany.mockResolvedValueOnce([p1, p2]);
      mockDecryptJson.mockReturnValue({ apiKey: 'key' });

      // Act
      const result = await registry.listActive('tenant-1');

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].config.id).toBe('p1');
    });
  });

  // --- invalidate ---

  describe('invalidate', () => {
    it('cache temizlenince aynı sağlayıcı yeniden oluşturulur', async () => {
      // Arrange
      const cfg = makeProviderConfig();
      mockDb.emailProviderConfig.findMany.mockResolvedValue([cfg]);
      mockDecryptJson.mockReturnValue({ apiKey: 'key' });

      // İlk çağrı — cache populate
      await registry.listActive('tenant-1');
      registry.invalidate('prov-1');

      // İkinci çağrı — cache miss, yeniden oluşturulur
      await registry.listActive('tenant-1');

      // Assert
      expect(mockDecryptJson).toHaveBeenCalledTimes(2);
    });
  });
});
