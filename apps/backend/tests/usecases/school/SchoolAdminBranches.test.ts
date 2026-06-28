/**
 * E-Sınıf SchoolAdmin (Platform Admin) — branch (dal) kapsamı.
 * ?? savunmaları (name/code/email/isActive/maxUsers), tarih doğrulama, liste filtreleri
 * + null admin/periodLinks, Update alan dalları, not-found.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    academicPeriod: { create: jest.fn(async ({ data }: any) => ({ id: 'per1', ...data })), findMany: jest.fn(async () => []), findUnique: jest.fn(async () => ({ id: 'per1' })) },
    school: { create: jest.fn(async ({ data }: any) => ({ id: 'sch1', ...data })), findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null), count: jest.fn(async () => 0), update: jest.fn(async ({ data }: any) => ({ id: 'sch1', isActive: false, ...data })) },
    schoolPeriod: { findUnique: jest.fn(async () => null), create: jest.fn(async () => ({})), count: jest.fn(async () => 2), delete: jest.fn(async () => ({})) },
    user: { findUnique: jest.fn(async () => null), create: jest.fn(async () => ({ id: 'u-new' })) },
    schoolUser: { create: jest.fn(async () => ({ id: 'su-new' })) },
    $transaction: jest.fn(async (fn: any) => fn({
      user: { create: jest.fn(async () => ({ id: 'u-new' })) },
      schoolUser: { create: jest.fn(async () => ({ id: 'su-new' })) },
      school: { update: jest.fn(async () => ({})) },
    })),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));
jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => 'hashed') }));

import * as Adm from '../../../src/application/use-cases/school/SchoolAdminUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
beforeEach(() => {
  jest.clearAllMocks();
  p.academicPeriod.findUnique.mockResolvedValue({ id: 'per1' });
  p.school.findUnique.mockResolvedValue(null);
});

describe('CreateAcademicPeriod — name/date/isActive dalları', () => {
  it('name undefined → NAME_REQUIRED', async () => {
    await expect(new Adm.CreateAcademicPeriodUseCase().execute({ startDate: '2026-01-01', endDate: '2026-06-01' } as any, 'a1')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
  it('geçersiz tarih → INVALID_DATE', async () => {
    await expect(new Adm.CreateAcademicPeriodUseCase().execute({ name: 'D', startDate: 'xx', endDate: 'yy' }, 'a1')).rejects.toMatchObject({ code: 'INVALID_DATE' });
  });
  it('bitiş <= başlangıç → INVALID_RANGE', async () => {
    await expect(new Adm.CreateAcademicPeriodUseCase().execute({ name: 'D', startDate: '2026-06-01', endDate: '2026-01-01' }, 'a1')).rejects.toMatchObject({ code: 'INVALID_RANGE' });
  });
  it('isActive verilmezse default false (?? false)', async () => {
    const r = await new Adm.CreateAcademicPeriodUseCase().execute({ name: 'D', startDate: '2026-01-01', endDate: '2026-06-01' }, 'a1');
    expect(r.isActive).toBe(false);
  });
});

describe('CreateSchool — name/code/maxUsers dalları', () => {
  it('name undefined → NAME_REQUIRED', async () => {
    await expect(new Adm.CreateSchoolUseCase().execute({ code: 'ANK', periodId: 'per1' } as any, 'a1')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
  it('code undefined/geçersiz → INVALID_CODE', async () => {
    await expect(new Adm.CreateSchoolUseCase().execute({ name: 'Okul', periodId: 'per1' } as any, 'a1')).rejects.toMatchObject({ code: 'INVALID_CODE' });
  });
  it('dönem yok → PERIOD_NOT_FOUND', async () => {
    p.academicPeriod.findUnique.mockResolvedValue(null);
    await expect(new Adm.CreateSchoolUseCase().execute({ name: 'Okul', code: 'ANK', periodId: 'pX' }, 'a1')).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
  });
  it('kod kullanımda → CODE_TAKEN', async () => {
    p.school.findUnique.mockResolvedValue({ id: 'exists' });
    await expect(new Adm.CreateSchoolUseCase().execute({ name: 'Okul', code: 'ANK', periodId: 'per1' }, 'a1')).rejects.toMatchObject({ code: 'CODE_TAKEN' });
  });
  it('başarı: maxUsers/annualLiveLimit/city/schoolType defaultları (?? 0, MIDDLE)', async () => {
    const r = await new Adm.CreateSchoolUseCase().execute({ name: 'Okul', code: 'ank', periodId: 'per1' }, 'a1');
    expect(r).toMatchObject({ code: 'ANK', maxUsers: 0, annualLiveLimit: 0, schoolType: 'MIDDLE', city: null });
  });
});

describe('ListSchools — defaultlar + filtreler + null ilişkiler', () => {
  it('parametresiz: defaultlar (page 1, pageSize 12)', async () => {
    p.school.findMany.mockResolvedValue([]);
    const r = await new Adm.ListSchoolsUseCase().execute();
    expect(r).toMatchObject({ page: 1, pageSize: 12, total: 0, totalPages: 1 });
  });
  it('filtreler (q/schoolType/periodId/adminEmail) where e yansır', async () => {
    p.school.findMany.mockResolvedValue([]);
    p.school.count.mockResolvedValue(0);
    await new Adm.ListSchoolsUseCase().execute({ q: 'ank', schoolType: 'HIGH', periodId: 'p1', adminEmail: 'a@b.com', page: 2, pageSize: 5 });
    const where = p.school.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeTruthy();
    expect(where.schoolType).toBe('HIGH');
    expect(where.periodId).toBe('p1');
    expect(where.adminUser).toBeTruthy();
  });
  it('satır eşleme: adminUser null + periodLinks startDate null sort', async () => {
    p.school.findMany.mockResolvedValue([{
      id: 's1', name: 'O', code: 'ANK', city: null, schoolType: 'MIDDLE', period: null, adminUser: null,
      periodLinks: [{ period: { id: 'p1', name: '2025', startDate: new Date('2025-09-01') } }, { period: { id: 'p2', name: '2026', startDate: new Date('2026-09-01') } }, { period: { id: 'p3', name: '2024', startDate: new Date('2024-09-01') } }],
      maxUsers: 0, _count: { schoolUsers: 0, branches: 0, departments: 0 }, annualLiveLimit: 0, usedLiveCount: 0, isActive: true, createdAt: new Date(),
    }]);
    p.school.count.mockResolvedValue(1);
    const r = await new Adm.ListSchoolsUseCase().execute({});
    expect(r.items[0]).toMatchObject({ adminUsername: null, adminEmail: null, adminName: null });
    expect(r.items[0].periods).toHaveLength(3);
  });
});

describe('UpdateSchool — alan dalları + not-found', () => {
  it('okul yok → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new Adm.UpdateSchoolUseCase().execute('sX', { name: 'Y' }, 'a1')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('name boş → NAME_REQUIRED', async () => {
    p.school.findUnique.mockResolvedValue({ id: 's1' });
    await expect(new Adm.UpdateSchoolUseCase().execute('s1', { name: '  ' }, 'a1')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
  it('tüm alanlar (city/schoolType/maxUsers/annualLiveLimit/isActive)', async () => {
    p.school.findUnique.mockResolvedValue({ id: 's1' });
    await new Adm.UpdateSchoolUseCase().execute('s1', { name: 'Yeni', city: '  ', schoolType: 'HIGH', maxUsers: 50, annualLiveLimit: 5, isActive: false }, 'a1');
    const data = p.school.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ name: 'Yeni', city: null, schoolType: 'HIGH', maxUsers: 50, annualLiveLimit: 5, isActive: false });
  });
});

describe('DeactivateSchool / AssignSchoolPeriod — not-found', () => {
  it('Deactivate: okul yok → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new Adm.DeactivateSchoolUseCase().execute('sX', 'a1')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('AssignSchoolPeriod: okul yok → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new Adm.AssignSchoolPeriodUseCase().execute('sX', { periodId: 'per1' }, 'a1')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
});

describe('AssignSchoolAdmin — email/ad dalları', () => {
  it('email undefined/geçersiz → INVALID_EMAIL', async () => {
    p.school.findUnique.mockResolvedValue({ id: 's1', code: 'ANK', tenantId: 'ten1' });
    await expect(new Adm.AssignSchoolAdminUseCase().execute('s1', {} as any, 'a1')).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
  });
  it('e-posta kayıtlı → EMAIL_TAKEN', async () => {
    p.school.findUnique.mockResolvedValue({ id: 's1', code: 'ANK', tenantId: 'ten1' });
    p.user.findUnique.mockResolvedValue({ id: 'exists' });
    await expect(new Adm.AssignSchoolAdminUseCase().execute('s1', { email: 'a@b.com' }, 'a1')).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });
  it('başarı: firstName/lastName boş → null (trim||null)', async () => {
    p.school.findUnique.mockResolvedValue({ id: 's1', code: 'ANK', tenantId: 'ten1' });
    p.user.findUnique.mockResolvedValue(null);
    const r = await new Adm.AssignSchoolAdminUseCase().execute('s1', { email: 'A@B.com', firstName: '  ', lastName: '  ' }, 'a1');
    expect(r).toMatchObject({ email: 'a@b.com' });
    expect(r.tempPassword).toBeTruthy();
  });
  it('başarı: firstName/lastName verilmedi (?? "")', async () => {
    p.school.findUnique.mockResolvedValue({ id: 's1', code: 'ANK', tenantId: 'ten1' });
    p.user.findUnique.mockResolvedValue(null);
    const r = await new Adm.AssignSchoolAdminUseCase().execute('s1', { email: 'c@d.com' }, 'a1');
    expect(r.email).toBe('c@d.com');
  });
});
