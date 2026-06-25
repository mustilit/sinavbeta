/**
 * E-Sınıf Admin use-case'leri — dönem + okul CRUD + okul yöneticisi atama.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    academicPeriod: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    school: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    schoolUser: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    schoolPeriod: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), count: jest.fn() },
    user: { create: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));

import {
  CreateAcademicPeriodUseCase,
  ListAcademicPeriodsUseCase,
  CreateSchoolUseCase,
  ListSchoolsUseCase,
  UpdateSchoolUseCase,
  DeactivateSchoolUseCase,
  AssignSchoolAdminUseCase,
  AssignSchoolPeriodUseCase,
  RemoveSchoolPeriodUseCase,
} from '../../../src/application/use-cases/school/SchoolAdminUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;

describe('CreateAcademicPeriodUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.academicPeriod.create.mockImplementation(async ({ data }: any) => ({ id: 'per1', ...data })); });

  it('ad boşsa NAME_REQUIRED', async () => {
    await expect(new CreateAcademicPeriodUseCase().execute({ name: '  ', startDate: '2026-09-01', endDate: '2027-06-01' }, 'a1')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
  it('bitiş başlangıçtan önceyse INVALID_RANGE', async () => {
    await expect(new CreateAcademicPeriodUseCase().execute({ name: '2026-2027', startDate: '2027-06-01', endDate: '2026-09-01' }, 'a1')).rejects.toMatchObject({ code: 'INVALID_RANGE' });
  });
  it('başarı: dönem oluşturulur', async () => {
    const r = await new CreateAcademicPeriodUseCase().execute({ name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-01', isActive: true }, 'a1');
    expect(r.name).toBe('2026-2027');
    expect(r.tenantId).toBe('ten1');
  });
});

describe('CreateSchoolUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.academicPeriod.findUnique.mockResolvedValue({ id: 'per1' });
    p.school.findUnique.mockResolvedValue(null);
    p.school.create.mockImplementation(async ({ data }: any) => ({ id: 'sch1', ...data }));
  });

  it('geçersiz kod (3-5 harf/rakam değil) → INVALID_CODE', async () => {
    await expect(new CreateSchoolUseCase().execute({ name: 'Okul', code: 'a!', periodId: 'per1' }, 'a1')).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });
  it('dönem yoksa → PERIOD_NOT_FOUND', async () => {
    p.academicPeriod.findUnique.mockResolvedValue(null);
    await expect(new CreateSchoolUseCase().execute({ name: 'Okul', code: 'ANK', periodId: 'yok' }, 'a1')).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
  });
  it('kod kullanımdaysa → CODE_TAKEN', async () => {
    p.school.findUnique.mockResolvedValue({ id: 'other' });
    await expect(new CreateSchoolUseCase().execute({ name: 'Okul', code: 'ANK', periodId: 'per1' }, 'a1')).rejects.toMatchObject({ code: 'CODE_TAKEN' });
  });
  it('başarı: kod uppercase + tenant atanır', async () => {
    const r = await new CreateSchoolUseCase().execute({ name: 'Okul', code: 'ank', periodId: 'per1', maxUsers: 200 }, 'a1');
    expect(r.code).toBe('ANK');
    expect(r.maxUsers).toBe(200);
  });
});

describe('AssignSchoolAdminUseCase (e-posta ile)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.school.findUnique.mockResolvedValue({ id: 'sch1', code: 'ANK', tenantId: 'ten1' });
    p.user.findUnique.mockResolvedValue(null); // e-posta boşta
    p.$transaction.mockImplementation(async (fn: any) => fn({
      schoolUser: { create: jest.fn().mockResolvedValue({ id: 'su1' }) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u1' }) },
      school: { update: jest.fn() },
    }));
  });

  it('okul yoksa → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new AssignSchoolAdminUseCase().execute('yok', { email: 'mudur@okul.com' }, 'a1')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('geçersiz e-posta → INVALID_EMAIL', async () => {
    await expect(new AssignSchoolAdminUseCase().execute('sch1', { email: 'gecersiz' }, 'a1')).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
  });
  it('e-posta zaten kayıtlıysa → EMAIL_TAKEN', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(new AssignSchoolAdminUseCase().execute('sch1', { email: 'var@okul.com' }, 'a1')).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });
  it('başarı: e-posta (lowercase) + geçici şifre döner; kullanıcı adı üretilmez', async () => {
    const r = await new AssignSchoolAdminUseCase().execute('sch1', { email: 'Mudur@Okul.com', firstName: 'Ayşe' }, 'a1');
    expect(r.email).toBe('mudur@okul.com');
    expect(r.tempPassword).toHaveLength(8);
    expect((r as any).username).toBeUndefined();
  });
});

describe('ListAcademicPeriodsUseCase', () => {
  it('dönem listesi', async () => {
    p.academicPeriod.findMany.mockResolvedValue([{ id: 'per1', name: '2026-2027' }]);
    const r = await new ListAcademicPeriodsUseCase().execute();
    expect(r).toHaveLength(1);
  });
});

describe('ListSchoolsUseCase (filtre + sayfalama + periods)', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('items + total + periods[] döner', async () => {
    p.school.count.mockResolvedValue(1);
    p.school.findMany.mockResolvedValue([{
      id: 'sch1', name: 'Okul', code: 'ANK', city: 'Ankara', schoolType: 'MIDDLE',
      period: { id: 'per1', name: '2026-2027' },
      periodLinks: [{ period: { id: 'per1', name: '2026-2027', startDate: new Date('2026-09-01') } }],
      adminUser: { username: 'ALEF-A', email: 'a@x.com', firstName: 'A', lastName: 'B' },
      maxUsers: 100, annualLiveLimit: 10, usedLiveCount: 2, isActive: true, createdAt: new Date(),
      _count: { schoolUsers: 5, branches: 1, departments: 2 },
    }]);
    const r = await new ListSchoolsUseCase().execute({ q: 'ok', page: 1, pageSize: 12 });
    expect(r.total).toBe(1);
    expect(r.items[0]).toMatchObject({ code: 'ANK', adminEmail: 'a@x.com', userCount: 5 });
    expect(r.items[0].periods).toEqual([{ id: 'per1', name: '2026-2027' }]);
  });
});

describe('UpdateSchoolUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('okul yoksa SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new UpdateSchoolUseCase().execute('x', { name: 'Yeni' }, 'a1')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('başarı: alanlar güncellenir', async () => {
    p.school.findUnique.mockResolvedValue({ id: 'sch1' });
    p.school.update.mockResolvedValue({ id: 'sch1', name: 'Yeni' });
    const r = await new UpdateSchoolUseCase().execute('sch1', { name: 'Yeni', maxUsers: 50 }, 'a1');
    expect(r.name).toBe('Yeni');
  });
});

describe('DeactivateSchoolUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('okul yoksa SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new DeactivateSchoolUseCase().execute('x', 'a1')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('başarı: pasifleştirilir', async () => {
    p.school.findUnique.mockResolvedValue({ id: 'sch1' });
    p.school.update.mockResolvedValue({ id: 'sch1', isActive: false });
    const r = await new DeactivateSchoolUseCase().execute('sch1', 'a1');
    expect(r).toMatchObject({ id: 'sch1', isActive: false });
  });
});

describe('AssignSchoolPeriodUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.school.findUnique.mockResolvedValue({ id: 'sch1' }); p.academicPeriod.findUnique.mockResolvedValue({ id: 'per2' }); });
  it('zaten ekliyse PERIOD_ALREADY_LINKED', async () => {
    p.schoolPeriod.findUnique.mockResolvedValue({ id: 'sp1' });
    await expect(new AssignSchoolPeriodUseCase().execute('sch1', { periodId: 'per2' }, 'a1')).rejects.toMatchObject({ code: 'PERIOD_ALREADY_LINKED' });
  });
  it('dönem yoksa PERIOD_NOT_FOUND', async () => {
    p.academicPeriod.findUnique.mockResolvedValue(null);
    await expect(new AssignSchoolPeriodUseCase().execute('sch1', { periodId: 'x' }, 'a1')).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
  });
  it('başarı', async () => {
    p.schoolPeriod.findUnique.mockResolvedValue(null);
    p.schoolPeriod.create.mockResolvedValue({ id: 'sp2' });
    const r = await new AssignSchoolPeriodUseCase().execute('sch1', { periodId: 'per2' }, 'a1');
    expect(r).toEqual({ ok: true });
  });
});

describe('RemoveSchoolPeriodUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('bağ yoksa PERIOD_LINK_NOT_FOUND', async () => {
    p.schoolPeriod.findUnique.mockResolvedValue(null);
    await expect(new RemoveSchoolPeriodUseCase().execute('sch1', 'per2', 'a1')).rejects.toMatchObject({ code: 'PERIOD_LINK_NOT_FOUND' });
  });
  it('son dönem ise LAST_PERIOD', async () => {
    p.schoolPeriod.findUnique.mockResolvedValue({ id: 'sp1' });
    p.schoolPeriod.count.mockResolvedValue(1);
    await expect(new RemoveSchoolPeriodUseCase().execute('sch1', 'per1', 'a1')).rejects.toMatchObject({ code: 'LAST_PERIOD' });
  });
  it('başarı', async () => {
    p.schoolPeriod.findUnique.mockResolvedValue({ id: 'sp1' });
    p.schoolPeriod.count.mockResolvedValue(2);
    p.schoolPeriod.delete.mockResolvedValue({});
    const r = await new RemoveSchoolPeriodUseCase().execute('sch1', 'per1', 'a1');
    expect(r).toEqual({ ok: true });
  });
});
