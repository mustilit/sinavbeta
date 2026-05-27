/**
 * AcceptContractUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Sözleşme bulunamazsa CONTRACT_NOT_FOUND
 * - Sözleşme pasifse CONTRACT_NOT_ACTIVE
 * - Daha önce kabul ettiyse idempotent — yeni kayıt açılmaz
 * - Başarı: kabul kaydı oluşturulur, audit log yazılır
 * - IP ve userAgent geçirilebilir
 * - Audit log hatası fırlatmaz
 */

import { AcceptContractUseCase } from '../../../src/application/use-cases/contract/AcceptContractUseCase';

function makeContractRepo(contract: any = null) {
  return { getById: jest.fn().mockResolvedValue(contract) };
}

function makeAcceptanceRepo(existing: any = null) {
  return {
    findByUserAndContract: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockResolvedValue({
      id: 'acceptance-1',
      acceptedAt: new Date('2025-06-01T10:00:00Z'),
    }),
  };
}

function makeAuditRepo() {
  return { create: jest.fn().mockResolvedValue({}) };
}

function makeContract(overrides: any = {}) {
  return { id: 'contract-1', type: 'CANDIDATE', isActive: true, title: 'Kullanım Koşulları', ...overrides };
}

const BASE_PARAMS = { userId: 'user-1', contractId: 'contract-1' };

describe('AcceptContractUseCase', () => {
  it('sözleşme bulunamazsa CONTRACT_NOT_FOUND fırlatır', async () => {
    const uc = new AcceptContractUseCase(
      makeContractRepo(null) as any,
      makeAcceptanceRepo() as any,
    );
    await expect(uc.execute(BASE_PARAMS)).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
  });

  it('sözleşme pasifse CONTRACT_NOT_ACTIVE fırlatır', async () => {
    const uc = new AcceptContractUseCase(
      makeContractRepo(makeContract({ isActive: false })) as any,
      makeAcceptanceRepo() as any,
    );
    await expect(uc.execute(BASE_PARAMS)).rejects.toMatchObject({ code: 'CONTRACT_NOT_ACTIVE' });
  });

  it('daha önce kabul ettiyse idempotent yanıt — yeni kayıt açılmaz', async () => {
    const acceptanceRepo = makeAcceptanceRepo({ id: 'acc-1', acceptedAt: new Date('2025-01-01') });
    const uc = new AcceptContractUseCase(
      makeContractRepo(makeContract()) as any,
      acceptanceRepo as any,
    );
    const result = await uc.execute(BASE_PARAMS);
    expect(acceptanceRepo.create).not.toHaveBeenCalled();
    expect(result.acceptedAt).toBe(new Date('2025-01-01').toISOString());
  });

  it('başarı: kabul kaydı oluşturulur ve acceptedAt ISO string döner', async () => {
    const acceptanceRepo = makeAcceptanceRepo(null);
    const uc = new AcceptContractUseCase(
      makeContractRepo(makeContract()) as any,
      acceptanceRepo as any,
    );
    const result = await uc.execute(BASE_PARAMS);
    expect(acceptanceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', contractId: 'contract-1' }),
    );
    expect(result.acceptedAt).toBe('2025-06-01T10:00:00.000Z');
  });

  it('IP ve userAgent create\'e iletilir', async () => {
    const acceptanceRepo = makeAcceptanceRepo(null);
    const uc = new AcceptContractUseCase(
      makeContractRepo(makeContract()) as any,
      acceptanceRepo as any,
    );
    await uc.execute({ ...BASE_PARAMS, ip: '192.168.1.1', userAgent: 'Mozilla/5.0' });
    expect(acceptanceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '192.168.1.1', userAgent: 'Mozilla/5.0' }),
    );
  });

  it('audit log CONTRACT_ACCEPTED action ile yazılır', async () => {
    const auditRepo = makeAuditRepo();
    const uc = new AcceptContractUseCase(
      makeContractRepo(makeContract()) as any,
      makeAcceptanceRepo(null) as any,
      auditRepo as any,
    );
    await uc.execute(BASE_PARAMS);
    expect(auditRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONTRACT_ACCEPTED', actorId: 'user-1' }),
    );
  });

  it('audit log hatası fırlatmaz (best-effort)', async () => {
    const auditRepo = { create: jest.fn().mockRejectedValue(new Error('AUDIT_FAIL')) };
    const uc = new AcceptContractUseCase(
      makeContractRepo(makeContract()) as any,
      makeAcceptanceRepo(null) as any,
      auditRepo as any,
    );
    await expect(uc.execute(BASE_PARAMS)).resolves.toBeDefined();
  });
});
