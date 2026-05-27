/**
 * CreateContractUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Boş başlık → INVALID_INPUT
 * - Boş içerik → INVALID_INPUT
 * - Geçersiz tip → INVALID_INPUT (sadece CANDIDATE veya EDUCATOR)
 * - version < 1 → INVALID_INPUT
 * - Aynı versiyon varsa VERSION_EXISTS
 * - Başarı: sözleşme oluşturulur, isActive varsayılan false
 */

import { CreateContractUseCase } from '../../../src/application/use-cases/contract/CreateContractUseCase';

function makeContractRepo(existingList: any[] = []) {
  return {
    list: jest.fn().mockResolvedValue(existingList),
    create: jest.fn().mockImplementation(async (data: any) => ({ id: 'contract-1', ...data })),
  };
}

const VALID_INPUT = {
  type: 'CANDIDATE' as const,
  version: 1,
  title: 'Kullanım Koşulları',
  content: 'Bu bir sözleşme metnidir ve yeterince uzundur.',
};

describe('CreateContractUseCase', () => {
  it('başlık boşsa INVALID_INPUT fırlatır', async () => {
    const uc = new CreateContractUseCase(makeContractRepo() as any);
    await expect(uc.execute({ ...VALID_INPUT, title: '  ' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('içerik boşsa INVALID_INPUT fırlatır', async () => {
    const uc = new CreateContractUseCase(makeContractRepo() as any);
    await expect(uc.execute({ ...VALID_INPUT, content: '' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('type CANDIDATE değilse INVALID_INPUT fırlatır', async () => {
    const uc = new CreateContractUseCase(makeContractRepo() as any);
    await expect(uc.execute({ ...VALID_INPUT, type: 'ADMIN' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('version 0 ise INVALID_INPUT fırlatır', async () => {
    const uc = new CreateContractUseCase(makeContractRepo() as any);
    await expect(uc.execute({ ...VALID_INPUT, version: 0 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('aynı versiyon varsa VERSION_EXISTS fırlatır', async () => {
    const repo = makeContractRepo([{ version: 1, type: 'CANDIDATE', title: 'v1' }]);
    const uc = new CreateContractUseCase(repo as any);
    await expect(uc.execute(VALID_INPUT)).rejects.toMatchObject({ code: 'VERSION_EXISTS' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('başarı: sözleşme oluşturulur', async () => {
    const repo = makeContractRepo([]);
    const uc = new CreateContractUseCase(repo as any);
    const result = await uc.execute(VALID_INPUT);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CANDIDATE', version: 1 }),
    );
    expect((result as any).id).toBe('contract-1');
  });

  it('isActive varsayılan false olarak ayarlanır', async () => {
    const repo = makeContractRepo([]);
    const uc = new CreateContractUseCase(repo as any);
    await uc.execute(VALID_INPUT);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });

  it('isActive: true geçilirse true saklanır', async () => {
    const repo = makeContractRepo([]);
    const uc = new CreateContractUseCase(repo as any);
    await uc.execute({ ...VALID_INPUT, isActive: true });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
  });

  it('EDUCATOR tipi de kabul edilir', async () => {
    const repo = makeContractRepo([]);
    const uc = new CreateContractUseCase(repo as any);
    await expect(uc.execute({ ...VALID_INPUT, type: 'EDUCATOR' })).resolves.toBeDefined();
  });
});
