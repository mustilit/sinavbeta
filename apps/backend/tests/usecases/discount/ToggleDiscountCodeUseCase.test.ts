/**
 * ToggleDiscountCodeUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Kullanıcı bulunamazsa → USER_NOT_FOUND
 * - CANDIDATE rolü → USER_NOT_AUTHORIZED
 * - Kod bulunamazsa → NOT_FOUND
 * - EDUCATOR başka eğiticinin kodu → FORBIDDEN_NOT_OWNER
 * - ADMIN başkasının kodunu toggle edebilir
 * - Aktif kod deaktif edilir (isActive false → true sonuç)
 * - Deaktif kod aktif edilir (isActive true → false sonuç)
 */

const mockPrismaQueryRaw = jest.fn();
const mockPrismaExecuteRaw = jest.fn();

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    $queryRaw: (...args: any[]) => mockPrismaQueryRaw(...args),
    $executeRaw: (...args: any[]) => mockPrismaExecuteRaw(...args),
  },
}));

import { ToggleDiscountCodeUseCase } from '../../../src/application/use-cases/discount/ToggleDiscountCodeUseCase';

function makeUserRepo(user: any) {
  return { findById: jest.fn().mockResolvedValue(user) };
}

function makeEducator(overrides: Record<string, any> = {}) {
  return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', ...overrides };
}

function makeDiscountRow(overrides: Record<string, any> = {}) {
  return {
    id: 'disc-1',
    code: 'SAVE20',
    createdById: 'edu-1',
    isActive: true,
    percentOff: 20,
    maxUses: null,
    usedCount: 0,
    validFrom: null,
    validUntil: null,
    description: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ToggleDiscountCodeUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaQueryRaw.mockResolvedValue([makeDiscountRow()]);
    mockPrismaExecuteRaw.mockResolvedValue(1);
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(null) as any);
    await expect(uc.execute('edu-missing', 'disc-1')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('CANDIDATE rolü → USER_NOT_AUTHORIZED fırlatır', async () => {
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(makeEducator({ role: 'CANDIDATE' })) as any);
    await expect(uc.execute('cand-1', 'disc-1')).rejects.toMatchObject({ code: 'USER_NOT_AUTHORIZED' });
  });

  it('kod bulunamazsa NOT_FOUND fırlatır', async () => {
    mockPrismaQueryRaw.mockResolvedValue([]);
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(makeEducator()) as any);
    await expect(uc.execute('edu-1', 'disc-missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('EDUCATOR başka eğiticinin kodu → FORBIDDEN_NOT_OWNER fırlatır', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeDiscountRow({ createdById: 'other-edu' })]);
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(makeEducator()) as any);
    await expect(uc.execute('edu-1', 'disc-1')).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });

  it('ADMIN başkasının kodunu toggle edebilir', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeDiscountRow({ createdById: 'other-edu' })]);
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(makeEducator({ id: 'admin-1', role: 'ADMIN' })) as any);
    const result = await uc.execute('admin-1', 'disc-1');
    expect(result).toBeDefined();
    expect(result.isActive).toBe(false); // isActive: true → toggle → false
  });

  it('aktif kod → toggle sonucu isActive=false döner', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeDiscountRow({ isActive: true })]);
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(makeEducator()) as any);
    const result = await uc.execute('edu-1', 'disc-1');
    expect(result.isActive).toBe(false);
  });

  it('deaktif kod → toggle sonucu isActive=true döner', async () => {
    mockPrismaQueryRaw.mockResolvedValue([makeDiscountRow({ isActive: false })]);
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(makeEducator()) as any);
    const result = await uc.execute('edu-1', 'disc-1');
    expect(result.isActive).toBe(true);
  });

  it('$executeRaw çağrılır (DB güncelleme yapılır)', async () => {
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(makeEducator()) as any);
    await uc.execute('edu-1', 'disc-1');
    expect(mockPrismaExecuteRaw).toHaveBeenCalledTimes(1);
  });
});
