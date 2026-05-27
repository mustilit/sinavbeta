/**
 * TestProviderConfigUseCase testleri.
 * Test maili gönderimi, 404 koruma, başarı/başarısızlık sonuçları ve AuditLog test edilir.
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({ prisma: {} }));

import { TestProviderConfigUseCase } from '../../../src/application/use-cases/email/TestProviderConfigUseCase';

const makeResolvedProvider = (overrides: Partial<any> = {}) => ({
  config: {
    id: 'prov-1',
    tenantId: 'tenant-1',
    fromEmail: 'no-reply@example.com',
    fromName: 'Sınav Salonu',
    replyToEmail: null,
    kind: 'BREVO_API',
    ...overrides.config,
  },
  transport: { send: jest.fn() },
  ...overrides,
});

describe('TestProviderConfigUseCase', () => {
  let mockDb: any;
  let mockRegistry: any;
  let mockRenderer: any;
  let uc: TestProviderConfigUseCase;

  const baseInput = {
    tenantId: 'tenant-1',
    actorId: 'admin-1',
    providerConfigId: 'prov-1',
    toEmail: 'test@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      emailProviderConfig: { update: jest.fn().mockResolvedValue({}) },
    };
    mockRegistry = { resolveById: jest.fn() };
    mockRenderer = { render: jest.fn() };
    uc = new TestProviderConfigUseCase(mockDb, mockRegistry, mockRenderer);
  });

  it('provider bulunamazsa 404 fırlatır', async () => {
    // Arrange
    mockRegistry.resolveById.mockResolvedValue(null);

    // Act & Assert
    await expect(uc.execute(baseInput)).rejects.toMatchObject({ status: 404 });
  });

  it('farklı tenantId\'ye ait provider 404 fırlatır', async () => {
    // Arrange
    const wrongTenant = makeResolvedProvider({ config: { tenantId: 'other-tenant' } });
    mockRegistry.resolveById.mockResolvedValue(wrongTenant);

    // Act & Assert
    await expect(uc.execute(baseInput)).rejects.toMatchObject({ status: 404 });
  });

  it('başarılı gönderim sonucu ok:true ve messageId döner', async () => {
    // Arrange
    const resolved = makeResolvedProvider();
    mockRegistry.resolveById.mockResolvedValue(resolved);
    mockRenderer.render.mockResolvedValue({
      subject: 'Test E-posta',
      html: '<p>Test</p>',
      text: 'Test',
    });
    resolved.transport.send.mockResolvedValue({
      ok: true,
      messageId: 'msg-123',
      providerKind: 'BREVO_API',
    });

    // Act
    const result = await uc.execute(baseInput);

    // Assert
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe('msg-123');
    expect(mockDb.emailProviderConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastSuccessAt: expect.any(Date) }),
      }),
    );
  });

  it('gönderim başarısız olunca ok:false ve hata bilgisi döner', async () => {
    // Arrange
    const resolved = makeResolvedProvider();
    mockRegistry.resolveById.mockResolvedValue(resolved);
    mockRenderer.render.mockResolvedValue({ subject: 'Test', html: '<p>T</p>' });
    resolved.transport.send.mockResolvedValue({
      ok: false,
      errorCode: 'auth_error',
      errorMessage: 'Invalid API key',
      providerKind: 'BREVO_API',
    });

    // Act
    const result = await uc.execute(baseInput);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('auth_error');
    expect(mockDb.emailProviderConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastFailureAt: expect.any(Date) }),
      }),
    );
  });

  it('her gönderim denemesinde AuditLog yazılır', async () => {
    // Arrange
    const resolved = makeResolvedProvider();
    mockRegistry.resolveById.mockResolvedValue(resolved);
    mockRenderer.render.mockResolvedValue({ subject: 'Test', html: '<p>T</p>' });
    resolved.transport.send.mockResolvedValue({ ok: true, messageId: 'm1', providerKind: 'BREVO_API' });

    // Act
    await uc.execute(baseInput);

    // Assert
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'EMAIL_PROVIDER_TESTED' }),
      }),
    );
  });
});
