/**
 * ListEducatorObjectionsUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Eğitici testlerine yapılan itirazlar döner
 * - Status filtresi repo'ya iletilir
 * - İtiraz yoksa boş dizi döner
 */

import { ListEducatorObjectionsUseCase } from '../../../src/application/use-cases/objection/ListEducatorObjectionsUseCase';

function makeObjectionRepo(objections: any[] = []) {
  return { listByEducator: jest.fn().mockResolvedValue(objections) };
}

function makeObjection(overrides: Record<string, any> = {}) {
  return {
    id: 'obj-1',
    status: 'PENDING',
    reason: 'Yanlış soru',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ListEducatorObjectionsUseCase', () => {
  it('itiraz yoksa boş dizi döner', async () => {
    const uc = new ListEducatorObjectionsUseCase(makeObjectionRepo([]) as any);
    const result = await uc.execute('edu-1');
    expect(result).toEqual([]);
  });

  it('eğiticiye ait itirazlar döner', async () => {
    const objections = [makeObjection(), makeObjection({ id: 'obj-2' })];
    const uc = new ListEducatorObjectionsUseCase(makeObjectionRepo(objections) as any);
    const result = await uc.execute('edu-1');
    expect(result).toHaveLength(2);
  });

  it('status filtresi repo ya iletilir', async () => {
    const repo = makeObjectionRepo([makeObjection({ status: 'PENDING' })]);
    const uc = new ListEducatorObjectionsUseCase(repo as any);
    await uc.execute('edu-1', { status: 'PENDING' });
    expect(repo.listByEducator).toHaveBeenCalledWith('edu-1', { status: 'PENDING' });
  });

  it('filtre olmadan repo çağrılır', async () => {
    const repo = makeObjectionRepo([]);
    const uc = new ListEducatorObjectionsUseCase(repo as any);
    await uc.execute('edu-1');
    expect(repo.listByEducator).toHaveBeenCalledWith('edu-1', undefined);
  });
});
