/**
 * ListMyPurchasesUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - candidateId eksik → UNAUTHORIZED AppError
 * - Satın alma bulunamazsa boş dizi döner
 * - Satın almalar döner, repo çağrılır
 */

import { ListMyPurchasesUseCase } from '../../../src/application/use-cases/purchase/ListMyPurchasesUseCase';
import { AppError } from '../../../src/application/errors/AppError';

function makePurchaseRepo(purchases: any[] = []) {
  return { findByCandidateId: jest.fn().mockResolvedValue(purchases) };
}

describe('ListMyPurchasesUseCase', () => {
  it('candidateId eksik ise UNAUTHORIZED AppError fırlatır', async () => {
    const uc = new ListMyPurchasesUseCase(makePurchaseRepo() as any);
    await expect(uc.execute(undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('candidateId boş string ise UNAUTHORIZED AppError fırlatır', async () => {
    const uc = new ListMyPurchasesUseCase(makePurchaseRepo() as any);
    await expect(uc.execute('')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('satın alma yoksa boş dizi döner', async () => {
    const uc = new ListMyPurchasesUseCase(makePurchaseRepo([]) as any);
    const result = await uc.execute('cand-1');
    expect(result).toEqual([]);
  });

  it('repo çağrılır, satın almalar döner', async () => {
    const purchases = [{ id: 'pur-1', testId: 'test-1', candidateId: 'cand-1' }];
    const repo = makePurchaseRepo(purchases);
    const uc = new ListMyPurchasesUseCase(repo as any);
    const result = await uc.execute('cand-1');
    expect(repo.findByCandidateId).toHaveBeenCalledWith('cand-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pur-1');
  });
});
