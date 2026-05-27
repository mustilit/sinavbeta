/**
 * ListEducatorTestsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - educatorId eksik → UNAUTHORIZED AppError
 * - Test yoksa boş dizi döner
 * - Eğiticinin testleri listelenir
 */

import { ListEducatorTestsUseCase } from '../../../src/application/use-cases/test/ListEducatorTestsUseCase';

function makeExamRepo(tests: any[] = []) {
  return { findByEducatorId: jest.fn().mockResolvedValue(tests) };
}

function makeTest(overrides: Record<string, any> = {}) {
  return { id: 'test-1', title: 'Test Adı', educatorId: 'edu-1', status: 'PUBLISHED', ...overrides };
}

describe('ListEducatorTestsUseCase', () => {
  it('educatorId eksik ise UNAUTHORIZED AppError fırlatır', async () => {
    const uc = new ListEducatorTestsUseCase(makeExamRepo() as any);
    await expect(uc.execute('')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('test yoksa boş dizi döner', async () => {
    const uc = new ListEducatorTestsUseCase(makeExamRepo([]) as any);
    const result = await uc.execute('edu-1');
    expect(result).toEqual([]);
  });

  it('eğiticinin testleri listelenir', async () => {
    const tests = [makeTest(), makeTest({ id: 'test-2', title: 'Test 2' })];
    const repo = makeExamRepo(tests);
    const uc = new ListEducatorTestsUseCase(repo as any);
    const result = await uc.execute('edu-1');
    expect(result).toHaveLength(2);
    expect(repo.findByEducatorId).toHaveBeenCalledWith('edu-1');
  });
});
