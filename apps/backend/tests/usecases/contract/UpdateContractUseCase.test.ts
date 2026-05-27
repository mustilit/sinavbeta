/**
 * UpdateContractUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Sözleşme bulunamazsa → NOT_FOUND
 * - Başarı: partial update yapılır
 * - title trim edilir
 * - content trim edilir
 * - isActive güncellenir
 * - Sadece gönderilen alanlar güncellenir
 */

import { UpdateContractUseCase } from '../../../src/application/use-cases/contract/UpdateContractUseCase';

function makeContractRepo(contract: any) {
  return {
    getById: jest.fn().mockResolvedValue(contract),
    update: jest.fn().mockImplementation(async (id: string, data: any) => ({ id, ...data })),
  };
}

function makeContract(overrides: Record<string, any> = {}) {
  return {
    id: 'contract-1',
    type: 'TERMS',
    version: '1.0',
    title: 'Eski Başlık',
    content: 'Eski içerik',
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('UpdateContractUseCase', () => {
  it('sözleşme bulunamazsa NOT_FOUND fırlatır', async () => {
    const uc = new UpdateContractUseCase(makeContractRepo(null) as any);
    await expect(uc.execute('contract-missing', { title: 'Yeni Başlık' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('title güncellenir', async () => {
    const repo = makeContractRepo(makeContract());
    const uc = new UpdateContractUseCase(repo as any);
    await uc.execute('contract-1', { title: 'Yeni Başlık' });
    expect(repo.update).toHaveBeenCalledWith('contract-1', expect.objectContaining({ title: 'Yeni Başlık' }));
  });

  it('title trim edilir', async () => {
    const repo = makeContractRepo(makeContract());
    const uc = new UpdateContractUseCase(repo as any);
    await uc.execute('contract-1', { title: '  Boşluklu Başlık  ' });
    expect(repo.update).toHaveBeenCalledWith('contract-1', expect.objectContaining({ title: 'Boşluklu Başlık' }));
  });

  it('content trim edilir', async () => {
    const repo = makeContractRepo(makeContract());
    const uc = new UpdateContractUseCase(repo as any);
    await uc.execute('contract-1', { content: '  içerik  ' });
    expect(repo.update).toHaveBeenCalledWith('contract-1', expect.objectContaining({ content: 'içerik' }));
  });

  it('isActive güncellenir', async () => {
    const repo = makeContractRepo(makeContract({ isActive: true }));
    const uc = new UpdateContractUseCase(repo as any);
    await uc.execute('contract-1', { isActive: false });
    expect(repo.update).toHaveBeenCalledWith('contract-1', expect.objectContaining({ isActive: false }));
  });

  it('sadece gönderilen alanlar güncellenir (partial update)', async () => {
    const repo = makeContractRepo(makeContract());
    const uc = new UpdateContractUseCase(repo as any);
    await uc.execute('contract-1', { title: 'Sadece Başlık' });
    const updateArg = repo.update.mock.calls[0][1];
    expect(updateArg).toHaveProperty('title');
    expect(updateArg).not.toHaveProperty('content');
    expect(updateArg).not.toHaveProperty('isActive');
  });
});
