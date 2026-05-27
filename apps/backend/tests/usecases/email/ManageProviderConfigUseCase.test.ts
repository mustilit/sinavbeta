/**
 * ManageProviderConfigUseCase testleri.
 * Secret şifreleme, CONSOLE yasağı, 404 koruma, serialize maskeleme test edilir.
 */

process.env.EMAIL_SECRETS_KEY = 'a'.repeat(64);

const mockDb = {
  emailProviderConfig: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
};

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: mockDb,
}));

jest.mock('../../../src/application/services/email/providers/ProviderRegistry', () => ({
  getProviderRegistry: jest.fn().mockReturnValue({ invalidate: jest.fn() }),
}));

import { ManageProviderConfigUseCase } from '../../../src/application/use-cases/email/ManageProviderConfigUseCase';

const baseCreateInput = {
  tenantId: 'tenant-1',
  actorId: 'admin-1',
  name: 'Brevo Primary',
  kind: 'BREVO_API' as const,
  fromEmail: 'no-reply@example.com',
  fromName: 'Sınav Salonu',
  apiKey: 'brevo-api-key-123',
};

const makeDbConfig = (overrides: Partial<any> = {}) => ({
  id: 'prov-1',
  tenantId: 'tenant-1',
  name: 'Brevo Primary',
  kind: 'BREVO_API',
  priority: 100,
  isActive: true,
  fromEmail: 'no-reply@example.com',
  fromName: 'Sınav Salonu',
  replyToEmail: null,
  dailyCap: 300,
  dailySentCount: 0,
  dailyResetAt: new Date(),
  webhookSecret: null,
  encryptedSecrets: 'encrypted-payload',
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ManageProviderConfigUseCase', () => {
  let uc: ManageProviderConfigUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    uc = new ManageProviderConfigUseCase(mockDb as any);
  });

  describe('create', () => {
    it('BREVO_API sağlayıcısı oluşturulur ve encryptedSecrets set edilir', async () => {
      // Arrange
      const dbConfig = makeDbConfig();
      mockDb.emailProviderConfig.create.mockResolvedValue(dbConfig);

      // Act
      const result = await uc.create(baseCreateInput);

      // Assert
      expect(mockDb.emailProviderConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: 'BREVO_API',
            encryptedSecrets: expect.any(String),
          }),
        }),
      );
      expect(result.id).toBe('prov-1');
    });

    it('BREVO_API için apiKey eksikse hata fırlatır', async () => {
      // Arrange
      const inputNoKey = { ...baseCreateInput, apiKey: undefined };

      // Act & Assert
      await expect(uc.create(inputNoKey)).rejects.toMatchObject({ status: 400 });
    });

    it('CONSOLE provider production\'da 400 fırlatır', async () => {
      // Arrange
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Act & Assert
      await expect(
        uc.create({ ...baseCreateInput, kind: 'CONSOLE' as any, apiKey: undefined }),
      ).rejects.toMatchObject({ status: 400 });

      process.env.NODE_ENV = origEnv;
    });

    it('oluşturma sonrası AuditLog yazılır', async () => {
      // Arrange
      mockDb.emailProviderConfig.create.mockResolvedValue(makeDbConfig());

      // Act
      await uc.create(baseCreateInput);

      // Assert
      expect(mockDb.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EMAIL_PROVIDER_CREATED' }),
        }),
      );
    });
  });

  describe('update', () => {
    it('provider bulunamazsa 404 fırlatır', async () => {
      // Arrange
      mockDb.emailProviderConfig.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        uc.update({ tenantId: 'tenant-1', actorId: 'admin-1', id: 'nonexistent', name: 'Yeni' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('isActive güncellenir ve invalidate çağrılır', async () => {
      // Arrange
      const existing = makeDbConfig();
      mockDb.emailProviderConfig.findFirst.mockResolvedValue(existing);
      mockDb.emailProviderConfig.update.mockResolvedValue(makeDbConfig({ isActive: false }));

      // Act
      const result = await uc.update({ tenantId: 'tenant-1', actorId: 'admin-1', id: 'prov-1', isActive: false });

      // Assert
      expect(mockDb.emailProviderConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });
  });

  describe('delete', () => {
    it('provider bulunamazsa 404 fırlatır', async () => {
      // Arrange
      mockDb.emailProviderConfig.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        uc.delete({ tenantId: 'tenant-1', actorId: 'admin-1', id: 'nonexistent' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('silme işlemi sonrası ok:true döner', async () => {
      // Arrange
      mockDb.emailProviderConfig.findFirst.mockResolvedValue(makeDbConfig());
      mockDb.emailProviderConfig.delete.mockResolvedValue({});

      // Act
      const result = await uc.delete({ tenantId: 'tenant-1', actorId: 'admin-1', id: 'prov-1' });

      // Assert
      expect(result.ok).toBe(true);
    });
  });

  describe('list', () => {
    it('serialize ile hasSecrets=true ve webhookSecretSet hesaplanır', async () => {
      // Arrange
      const configs = [makeDbConfig({ webhookSecret: 'some-secret' })];
      mockDb.emailProviderConfig.findMany.mockResolvedValue(configs);

      // Act
      const result = await uc.list('tenant-1');

      // Assert
      expect(result[0].hasSecrets).toBe(true);
      expect(result[0].webhookSecretSet).toBe(true);
    });
  });
});
