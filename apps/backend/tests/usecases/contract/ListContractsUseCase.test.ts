/**
 * ListContractsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Tip filtresi olmadan tüm sözleşmeler listelenir
 * - Tip filtresiyle yalnızca ilgili sözleşmeler döner
 * - Sözleşme yoksa boş dizi döner
 * - repo.list çağrılır
 */

import { ListContractsUseCase } from '../../../src/application/use-cases/contract/ListContractsUseCase';

function makeContractRepo(contracts: any[] = []) {
  return { list: jest.fn().mockResolvedValue(contracts) };
}

function makeContract(overrides: Record<string, any> = {}) {
  return {
    id: 'contract-1',
    type: 'TERMS',
    version: '1.0',
    content: 'Kullanım şartları...',
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ListContractsUseCase', () => {
  it('sözleşme yoksa boş dizi döner', async () => {
    const uc = new ListContractsUseCase(makeContractRepo([]) as any);
    const result = await uc.execute();
    expect(result).toEqual([]);
  });

  it('tip filtresi olmadan repo.list çağrılır', async () => {
    const repo = makeContractRepo([makeContract()]);
    const uc = new ListContractsUseCase(repo as any);
    await uc.execute();
    expect(repo.list).toHaveBeenCalledWith(undefined);
  });

  it('TERMS tipi ile filtreleme yapılır', async () => {
    const repo = makeContractRepo([makeContract({ type: 'TERMS' })]);
    const uc = new ListContractsUseCase(repo as any);
    await uc.execute('TERMS' as any);
    expect(repo.list).toHaveBeenCalledWith('TERMS');
  });

  it('PRIVACY tipi ile filtreleme yapılır', async () => {
    const repo = makeContractRepo([makeContract({ type: 'PRIVACY' })]);
    const uc = new ListContractsUseCase(repo as any);
    await uc.execute('PRIVACY' as any);
    expect(repo.list).toHaveBeenCalledWith('PRIVACY');
  });

  it('birden fazla sözleşme döner', async () => {
    const contracts = [makeContract(), makeContract({ id: 'c2', type: 'PRIVACY' })];
    const uc = new ListContractsUseCase(makeContractRepo(contracts) as any);
    const result = await uc.execute();
    expect(result).toHaveLength(2);
  });
});
