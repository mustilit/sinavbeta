/**
 * E-Sınıf Admin use-case'leri — dönem + okul CRUD + okul yöneticisi atama.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    academicPeriod: { create: jest.fn(), findUnique: jest.fn() },
    school: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    schoolUser: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    user: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));

import {
  CreateAcademicPeriodUseCase,
  CreateSchoolUseCase,
  AssignSchoolAdminUseCase,
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

describe('AssignSchoolAdminUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.school.findUnique.mockResolvedValue({ id: 'sch1', code: 'ANK', tenantId: 'ten1' });
    p.$transaction.mockImplementation(async (fn: any) => fn({
      schoolUser: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'su1' }) },
      user: { create: jest.fn().mockResolvedValue({ id: 'u1' }) },
      school: { update: jest.fn() },
    }));
  });

  it('okul yoksa → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new AssignSchoolAdminUseCase().execute('yok', {}, 'a1')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('başarı: username (ANK-A-0001) + geçici şifre döner', async () => {
    const r = await new AssignSchoolAdminUseCase().execute('sch1', { firstName: 'Ayşe' }, 'a1');
    expect(r.username).toBe('ANK-A-0001');
    expect(r.tempPassword).toHaveLength(8);
  });
});
