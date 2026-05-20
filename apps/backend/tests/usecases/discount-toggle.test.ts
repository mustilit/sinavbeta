import { ToggleDiscountCodeUseCase } from '../../src/application/use-cases/discount/ToggleDiscountCodeUseCase';

// prisma mock ($queryRaw ve $executeRaw kullanıyor)
jest.mock('../../src/infrastructure/database/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(async () => {}),
  },
}));
import { prisma } from '../../src/infrastructure/database/prisma';

function makeUserRepo(user: any = null) {
  return { findById: jest.fn(async () => user) };
}
function makeEducator(overrides: any = {}) {
  return { id: 'edu-1', role: 'EDUCATOR', status: 'ACTIVE', ...overrides };
}
function makeCodeRow(overrides: any = {}) {
  return [{
    id: 'dc-1', code: 'SAVE10', createdById: 'edu-1',
    isActive: true, percentOff: 10, maxUses: null,
    usedCount: 0, validFrom: null, validUntil: null,
    description: null, createdAt: new Date(),
    ...overrides,
  }];
}

describe('ToggleDiscountCodeUseCase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('aktif kodu deaktive eder (true → false)', async () => {
    const userRepo = makeUserRepo(makeEducator());
    (prisma.$queryRaw as jest.Mock).mockResolvedValue(makeCodeRow({ isActive: true }));
    const uc = new ToggleDiscountCodeUseCase(userRepo as any);
    const result = await uc.execute('edu-1', 'dc-1');
    expect(result.isActive).toBe(false);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('deaktif kodu aktive eder (false → true)', async () => {
    const userRepo = makeUserRepo(makeEducator());
    (prisma.$queryRaw as jest.Mock).mockResolvedValue(makeCodeRow({ isActive: false }));
    const uc = new ToggleDiscountCodeUseCase(userRepo as any);
    const result = await uc.execute('edu-1', 'dc-1');
    expect(result.isActive).toBe(true);
  });

  it('kullanıcı bulunamazsa USER_NOT_FOUND fırlatır', async () => {
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(null) as any);
    await expect(uc.execute('edu-1', 'dc-1')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('EDUCATOR olmayan kullanıcı → USER_NOT_EDUCATOR', async () => {
    const uc = new ToggleDiscountCodeUseCase(makeUserRepo(makeEducator({ role: 'CANDIDATE' })) as any);
    await expect(uc.execute('edu-1', 'dc-1')).rejects.toMatchObject({ code: 'USER_NOT_EDUCATOR' });
  });

  it('kod bulunamazsa NOT_FOUND fırlatır', async () => {
    const userRepo = makeUserRepo(makeEducator());
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    const uc = new ToggleDiscountCodeUseCase(userRepo as any);
    await expect(uc.execute('edu-1', 'nonexistent')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('başkasının koduna erişim → FORBIDDEN_NOT_OWNER', async () => {
    const userRepo = makeUserRepo(makeEducator({ id: 'other-edu' }));
    (prisma.$queryRaw as jest.Mock).mockResolvedValue(makeCodeRow({ createdById: 'edu-1' }));
    const uc = new ToggleDiscountCodeUseCase(userRepo as any);
    await expect(uc.execute('other-edu', 'dc-1')).rejects.toMatchObject({ code: 'FORBIDDEN_NOT_OWNER' });
  });
});
