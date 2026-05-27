/**
 * GetActiveContractUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Aktif sözleşme bulunamazsa CONTRACT_NOT_FOUND
 * - Başarı: sözleşme alanları döner
 * - publishedAt null ise null döner
 * - publishedAt ISO 8601 string olarak döner
 */

import { GetActiveContractUseCase } from '../../../src/application/use-cases/contract/GetActiveContractUseCase';

function makeContractRepo(contract: any = null) {
  return {
    getActiveByType: jest.fn().mockResolvedValue(contract),
  };
}

function makeContract(overrides: any = {}) {
  return {
    id: 'contract-1',
    type: 'CANDIDATE' as const,
    version: 1,
    title: 'Kullanım Koşulları',
    content: 'Sözleşme metni...',
    isActive: true,
    publishedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('GetActiveContractUseCase', () => {
  it('aktif sözleşme bulunamazsa CONTRACT_NOT_FOUND fırlatır', async () => {
    const uc = new GetActiveContractUseCase(makeContractRepo(null) as any);
    await expect(uc.execute({ type: 'CANDIDATE' })).rejects.toMatchObject({
      code: 'CONTRACT_NOT_FOUND',
    });
  });

  it('başarı: sözleşme alanları döner', async () => {
    const uc = new GetActiveContractUseCase(makeContractRepo(makeContract()) as any);
    const result = await uc.execute({ type: 'CANDIDATE' });
    expect(result.id).toBe('contract-1');
    expect(result.title).toBe('Kullanım Koşulları');
    expect(result.version).toBe(1);
    expect(result.type).toBe('CANDIDATE');
  });

  it('publishedAt ISO 8601 string olarak döner', async () => {
    const uc = new GetActiveContractUseCase(makeContractRepo(makeContract()) as any);
    const result = await uc.execute({ type: 'CANDIDATE' });
    expect(typeof result.publishedAt).toBe('string');
    expect(result.publishedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('publishedAt null ise null döner', async () => {
    const uc = new GetActiveContractUseCase(
      makeContractRepo(makeContract({ publishedAt: null })) as any,
    );
    const result = await uc.execute({ type: 'CANDIDATE' });
    expect(result.publishedAt).toBeNull();
  });

  it('repo.getActiveByType tip parametresi ile çağrılır', async () => {
    const repo = makeContractRepo(makeContract({ type: 'EDUCATOR' }));
    const uc = new GetActiveContractUseCase(repo as any);
    await uc.execute({ type: 'EDUCATOR' });
    expect(repo.getActiveByType).toHaveBeenCalledWith('EDUCATOR');
  });
});
