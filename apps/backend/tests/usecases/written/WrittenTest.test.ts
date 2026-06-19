/**
 * WrittenTestUseCases unit testleri.
 * PACKAGE_PUBLISHED lock + ownership + CRUD.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    writtenPackage: { findUnique: jest.fn() },
    writtenTest: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
    adminSettings: { findFirst: jest.fn() },
  },
}));

import {
  CreateWrittenTestUseCase,
  UpdateWrittenTestUseCase,
  DeleteWrittenTestUseCase,
} from '../../../src/application/use-cases/written/WrittenTestUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => jest.clearAllMocks());

function makePkg(overrides: any = {}) {
  return {
    id: 'pkg1',
    educatorId: 'edu1',
    publishedAt: null,
    tenantId: 'ten1',
    ...overrides,
  };
}

function makeTest(overrides: any = {}) {
  return {
    id: 'tst1',
    packageId: 'pkg1',
    package: { id: 'pkg1', educatorId: 'edu1', publishedAt: null },
    deletedAt: null,
    ...overrides,
  };
}

// ─── CreateWrittenTestUseCase ──────────────────────────────────

describe('CreateWrittenTestUseCase', () => {
  it('actorId yoksa → UNAUTHORIZED', async () => {
    await expect(
      new CreateWrittenTestUseCase().execute({ packageId: 'pkg1', title: 'T' }, null),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('başlık boş → TITLE_REQUIRED', async () => {
    await expect(
      new CreateWrittenTestUseCase().execute({ packageId: 'pkg1', title: '' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'TITLE_REQUIRED' });
  });

  it('paket bulunamadı → PACKAGE_NOT_FOUND', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(null);
    await expect(
      new CreateWrittenTestUseCase().execute({ packageId: 'pkg1', title: 'T' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'PACKAGE_NOT_FOUND' });
  });

  it('başka eğitici paketi → FORBIDDEN', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(makePkg({ educatorId: 'other' }));
    await expect(
      new CreateWrittenTestUseCase().execute({ packageId: 'pkg1', title: 'T' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('yayımlanmış paket → PACKAGE_PUBLISHED', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(makePkg({ publishedAt: new Date() }));
    await expect(
      new CreateWrittenTestUseCase().execute({ packageId: 'pkg1', title: 'T' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'PACKAGE_PUBLISHED' });
  });

  it('admin başka eğiticinin paketine test ekleyebilir', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(makePkg({ educatorId: 'other' }));
    p.writtenTest.create.mockResolvedValue({ id: 'tst1', title: 'Test' });
    const result = await new CreateWrittenTestUseCase().execute(
      { packageId: 'pkg1', title: 'Test' },
      'admin1',
      'ADMIN',
    );
    expect(result).toMatchObject({ id: 'tst1' });
  });

  it('başarılı create', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(makePkg());
    p.writtenTest.create.mockResolvedValue({ id: 'tst1', title: 'Yazılı Test 1', status: 'DRAFT' });
    const result = await new CreateWrittenTestUseCase().execute(
      { packageId: 'pkg1', title: 'Yazılı Test 1', isTimed: true, duration: 60 },
      'edu1',
    );
    expect(result).toMatchObject({ id: 'tst1', status: 'DRAFT' });
    const createCall = p.writtenTest.create.mock.calls[0][0].data;
    expect(createCall.packageId).toBe('pkg1');
    expect(createCall.tenantId).toBe('ten1');
    expect(createCall.isTimed).toBe(true);
    expect(createCall.duration).toBe(60);
    expect(createCall.status).toBe('DRAFT');
  });

  it('admin limiti aşılırsa → PACKAGE_FULL', async () => {
    p.writtenPackage.findUnique.mockResolvedValue(makePkg());
    p.adminSettings.findFirst.mockResolvedValue({ maxWrittenTestsPerPackage: 2 });
    p.writtenTest.count.mockResolvedValue(2);
    await expect(
      new CreateWrittenTestUseCase().execute({ packageId: 'pkg1', title: 'T' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'PACKAGE_FULL' });
    expect(p.writtenTest.create).not.toHaveBeenCalled();
  });
});

// ─── UpdateWrittenTestUseCase ──────────────────────────────────

describe('UpdateWrittenTestUseCase', () => {
  it('actorId yoksa → UNAUTHORIZED', async () => {
    await expect(
      new UpdateWrittenTestUseCase().execute('tst1', { title: 'X' }, null),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('test bulunamadı → TEST_NOT_FOUND', async () => {
    p.writtenTest.findUnique.mockResolvedValue(null);
    await expect(
      new UpdateWrittenTestUseCase().execute('tst1', { title: 'X' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'TEST_NOT_FOUND' });
  });

  it('başka eğitici → FORBIDDEN', async () => {
    p.writtenTest.findUnique.mockResolvedValue(
      makeTest({ package: { id: 'pkg1', educatorId: 'other', publishedAt: null } }),
    );
    await expect(
      new UpdateWrittenTestUseCase().execute('tst1', { title: 'X' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('yayımlanmış paket → PACKAGE_PUBLISHED', async () => {
    p.writtenTest.findUnique.mockResolvedValue(
      makeTest({ package: { id: 'pkg1', educatorId: 'edu1', publishedAt: new Date() } }),
    );
    await expect(
      new UpdateWrittenTestUseCase().execute('tst1', { title: 'X' }, 'edu1'),
    ).rejects.toMatchObject({ code: 'PACKAGE_PUBLISHED' });
  });

  it('başarılı güncelleme', async () => {
    p.writtenTest.findUnique.mockResolvedValue(makeTest());
    p.writtenTest.update.mockResolvedValue({ id: 'tst1', title: 'Güncel Başlık' });
    const result = await new UpdateWrittenTestUseCase().execute(
      'tst1', { title: 'Güncel Başlık' }, 'edu1',
    );
    expect(result).toMatchObject({ title: 'Güncel Başlık' });
  });
});

// ─── DeleteWrittenTestUseCase ──────────────────────────────────

describe('DeleteWrittenTestUseCase', () => {
  it('actorId yoksa → UNAUTHORIZED', async () => {
    await expect(
      new DeleteWrittenTestUseCase().execute('tst1', null),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('yayımlanmış paket → PACKAGE_PUBLISHED', async () => {
    p.writtenTest.findUnique.mockResolvedValue(
      makeTest({ package: { id: 'pkg1', educatorId: 'edu1', publishedAt: new Date() } }),
    );
    await expect(
      new DeleteWrittenTestUseCase().execute('tst1', 'edu1'),
    ).rejects.toMatchObject({ code: 'PACKAGE_PUBLISHED' });
  });

  it('başarılı soft delete', async () => {
    p.writtenTest.findUnique.mockResolvedValue(makeTest());
    p.writtenTest.update.mockResolvedValue({ id: 'tst1', deletedAt: new Date() });
    const result = await new DeleteWrittenTestUseCase().execute('tst1', 'edu1');
    expect(result).toMatchObject({ id: 'tst1' });
    const updateCall = p.writtenTest.update.mock.calls[0][0];
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });
});
