/**
 * WrittenPackageUseCases unit testleri.
 * Publish validation + ownership + temel CRUD.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    writtenPackage: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    writtenTest: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    writtenQuestion: { count: jest.fn() },
    adminSettings: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import {
  CreateWrittenPackageUseCase,
  UpdateWrittenPackageUseCase,
  PublishWrittenPackageUseCase,
  UnpublishWrittenPackageUseCase,
  ListEducatorWrittenPackagesUseCase,
  GetWrittenPackageUseCase,
} from '../../../src/application/use-cases/written/WrittenPackageUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

// ─── CreateWrittenPackageUseCase ──────────────────────────────

describe('CreateWrittenPackageUseCase', () => {
  it('actorId yoksa → UNAUTHORIZED', async () => {
    await expect(new CreateWrittenPackageUseCase().execute({ title: 'T' }, null)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('başlık boş → TITLE_REQUIRED', async () => {
    await expect(
      new CreateWrittenPackageUseCase().execute({ title: '   ' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'TITLE_REQUIRED' });
  });

  it('kullanıcı bulunamadı → UNAUTHORIZED', async () => {
    p.user.findUnique.mockResolvedValue(null);
    await expect(
      new CreateWrittenPackageUseCase().execute({ title: 'Test Paketi' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('başarılı create', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'edu1', tenantId: 'ten1' });
    p.writtenPackage.create.mockResolvedValue({ id: 'pkg1', title: 'Test Paketi' });

    const result = await new CreateWrittenPackageUseCase().execute(
      { title: 'Test Paketi', priceCents: 1000 },
      'edu1',
    );
    expect(result).toMatchObject({ id: 'pkg1' });
    const createCall = p.writtenPackage.create.mock.calls[0][0].data;
    expect(createCall.tenantId).toBe('ten1');
    expect(createCall.educatorId).toBe('edu1');
    expect(createCall.priceCents).toBe(1000);
  });
});

// ─── UpdateWrittenPackageUseCase ──────────────────────────────

describe('UpdateWrittenPackageUseCase', () => {
  it('paket bulunamadı → PACKAGE_NOT_FOUND', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(null);
    await expect(
      new UpdateWrittenPackageUseCase().execute('pkg1', { title: 'X' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'PACKAGE_NOT_FOUND' });
  });

  it('başka eğitici → FORBIDDEN', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', educatorId: 'other', publishedAt: null, tenantId: 'ten1',
    });
    await expect(
      new UpdateWrittenPackageUseCase().execute('pkg1', { title: 'X' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admin bypass sahiplik kontrolü', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', educatorId: 'other', publishedAt: null, tenantId: 'ten1',
    });
    p.writtenPackage.update.mockResolvedValue({ id: 'pkg1', title: 'Yeni' });
    const result = await new UpdateWrittenPackageUseCase().execute(
      'pkg1', { title: 'Yeni' }, 'admin1', 'ADMIN',
    );
    expect(result).toMatchObject({ id: 'pkg1' });
  });

  it('başarılı meta güncelleme (yayımlıyken de serbest)', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', educatorId: 'edu1', publishedAt: new Date(), tenantId: 'ten1',
    });
    p.writtenPackage.update.mockResolvedValue({ id: 'pkg1', title: 'Güncel' });
    const result = await new UpdateWrittenPackageUseCase().execute(
      'pkg1', { title: 'Güncel' }, 'edu1',
    );
    expect(result).toMatchObject({ id: 'pkg1' });
  });
});

// ─── PublishWrittenPackageUseCase ─────────────────────────────

describe('PublishWrittenPackageUseCase', () => {
  const setupPkg = (overrides: any = {}) =>
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', educatorId: 'edu1', publishedAt: null, tenantId: 'ten1', ...overrides,
    });

  it('test yoksa → NO_TESTS', async () => {
    setupPkg();
    p.writtenTest.findMany.mockResolvedValue([]);
    await expect(
      new PublishWrittenPackageUseCase().execute('pkg1', 'edu1'),
    ).rejects.toMatchObject({ code: 'NO_TESTS' });
  });

  it('test içinde soru yoksa → TEST_HAS_NO_QUESTIONS', async () => {
    setupPkg();
    p.writtenTest.findMany.mockResolvedValue([
      { id: 'tst1', title: 'Test 1', questions: [] },
    ]);
    await expect(
      new PublishWrittenPackageUseCase().execute('pkg1', 'edu1'),
    ).rejects.toMatchObject({ code: 'TEST_HAS_NO_QUESTIONS' });
  });

  it('çözüm eksik soru → QUESTION_MISSING_SOLUTION', async () => {
    setupPkg();
    p.writtenTest.findMany.mockResolvedValue([
      {
        id: 'tst1',
        title: 'Test 1',
        questions: [{ id: 'q1', solutionText: null, solutionMediaUrl: null }],
      },
    ]);
    await expect(
      new PublishWrittenPackageUseCase().execute('pkg1', 'edu1'),
    ).rejects.toMatchObject({ code: 'QUESTION_MISSING_SOLUTION' });
  });

  it('başarılı publish — transaction kullanır', async () => {
    setupPkg();
    p.writtenTest.findMany.mockResolvedValue([
      {
        id: 'tst1',
        title: 'Test 1',
        questions: [{ id: 'q1', solutionText: 'Çözüm 1', solutionMediaUrl: null }],
      },
    ]);
    const mockTx = {
      writtenTest: { update: jest.fn().mockResolvedValue({ id: 'tst1' }) },
      writtenPackage: { update: jest.fn().mockResolvedValue({ id: 'pkg1', publishedAt: new Date() }) },
    };
    p.$transaction.mockImplementation((fn: any) => fn(mockTx));

    const result = await new PublishWrittenPackageUseCase().execute('pkg1', 'edu1');
    expect(result).toMatchObject({ id: 'pkg1' });
    expect(mockTx.writtenTest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
    expect(mockTx.writtenPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: true }) }),
    );
  });

  it('başka eğitici paket → FORBIDDEN', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', educatorId: 'other', publishedAt: null, tenantId: 'ten1',
    });
    p.writtenTest.findMany.mockResolvedValue([]);
    await expect(
      new PublishWrittenPackageUseCase().execute('pkg1', 'edu1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('solutionMediaUrl yeterli (solutionText null olabilir)', async () => {
    setupPkg();
    p.writtenTest.findMany.mockResolvedValue([
      {
        id: 'tst1',
        title: 'Test 1',
        questions: [{ id: 'q1', solutionText: null, solutionMediaUrl: 'https://example.com/sol.png' }],
      },
    ]);
    const mockTx = {
      writtenTest: { update: jest.fn().mockResolvedValue({ id: 'tst1' }) },
      writtenPackage: { update: jest.fn().mockResolvedValue({ id: 'pkg1', publishedAt: new Date() }) },
    };
    p.$transaction.mockImplementation((fn: any) => fn(mockTx));
    const result = await new PublishWrittenPackageUseCase().execute('pkg1', 'edu1');
    expect(result).toMatchObject({ id: 'pkg1' });
  });
});

// ─── ListEducatorWrittenPackagesUseCase ───────────────────────

describe('ListEducatorWrittenPackagesUseCase', () => {
  it('actorId yoksa → UNAUTHORIZED', async () => {
    await expect(new ListEducatorWrittenPackagesUseCase().execute(null)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('paket listesini döner', async () => {
    p.writtenPackage.findMany.mockResolvedValue([
      {
        id: 'pkg1', title: 'P1', priceCents: 0, currency: 'TRY',
        difficulty: 'medium', coverImageUrl: null, isActive: true,
        publishedAt: null, createdAt: new Date(), updatedAt: new Date(),
        description: null, _count: { tests: 3 },
      },
    ]);
    const result = await new ListEducatorWrittenPackagesUseCase().execute('edu1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].testCount).toBe(3);
    expect(result.items[0]._count).toBeUndefined();
  });
});

// ─── GetWrittenPackageUseCase ─────────────────────────────────

describe('GetWrittenPackageUseCase', () => {
  it('bulunamadı → PACKAGE_NOT_FOUND', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(null);
    await expect(
      new GetWrittenPackageUseCase().execute('pkg1', 'edu1', 'EDUCATOR'),
    ).rejects.toMatchObject({ code: 'PACKAGE_NOT_FOUND' });
  });

  it('başka eğitici → FORBIDDEN', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', educatorId: 'other', tests: [],
    });
    await expect(
      new GetWrittenPackageUseCase().execute('pkg1', 'edu1', 'EDUCATOR'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admin her paketi görebilir', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1', educatorId: 'other', tests: [],
    });
    const result = await new GetWrittenPackageUseCase().execute('pkg1', 'admin1', 'ADMIN');
    expect(result).toMatchObject({ id: 'pkg1' });
  });

  it('sahibi görebilir + solutionText dahil', async () => {
    p.writtenPackage.findUnique.mockResolvedValue({
      id: 'pkg1',
      educatorId: 'edu1',
      tests: [
        {
          id: 'tst1',
          questions: [{ id: 'q1', content: 'Soru', solutionText: 'Çözüm' }],
        },
      ],
    });
    const result = await new GetWrittenPackageUseCase().execute('pkg1', 'edu1', 'EDUCATOR');
    expect(result.tests[0].questions[0].solutionText).toBe('Çözüm');
  });
});
