/**
 * E-Sınıf Okul Yöneticisi organizasyon use-case'leri — sınıf/öğrenci/zümre/kota.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), count: jest.fn() },
    branch: { findFirst: jest.fn(), create: jest.fn() },
    schoolLevel: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    classroom: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    department: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    school: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import {
  CreateLevelUseCase,
  CreateClassroomUseCase,
  AssignClassroomAdminUseCase,
  AssignStudentsToClassroomUseCase,
  CreateDepartmentUseCase,
  AssignDepartmentMembersUseCase,
  GetSchoolQuotaUseCase,
} from '../../../src/application/use-cases/school/SchoolOrgUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const admin = { id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };

describe('CreateLevelUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(admin);
    p.branch.findFirst.mockResolvedValue({ id: 'b1' });
    p.schoolLevel.findUnique.mockResolvedValue(null);
    p.schoolLevel.create.mockImplementation(async ({ data }: any) => ({ id: 'lv1', ...data }));
  });

  it('seviye 1-12 dışında → INVALID_GRADE', async () => {
    await expect(new CreateLevelUseCase().execute({ branchId: 'b1', gradeLevel: 13 }, 'u0')).rejects.toMatchObject({ code: 'INVALID_GRADE' });
  });
  it('şube okulda yoksa → BRANCH_NOT_FOUND', async () => {
    p.branch.findFirst.mockResolvedValue(null);
    await expect(new CreateLevelUseCase().execute({ branchId: 'x', gradeLevel: 5 }, 'u0')).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
  });
  it('aynı seviye varsa → LEVEL_EXISTS', async () => {
    p.schoolLevel.findUnique.mockResolvedValue({ id: 'dup' });
    await expect(new CreateLevelUseCase().execute({ branchId: 'b1', gradeLevel: 5 }, 'u0')).rejects.toMatchObject({ code: 'LEVEL_EXISTS' });
  });
  it('başarı', async () => {
    const r = await new CreateLevelUseCase().execute({ branchId: 'b1', gradeLevel: 5 }, 'u0');
    expect(r.gradeLevel).toBe(5);
  });
});

describe('CreateClassroomUseCase (seviye altında)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(admin);
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1', gradeLevel: 5 });
    p.classroom.create.mockImplementation(async ({ data }: any) => ({ id: 'c1', ...data }));
  });

  it('seviye yoksa → LEVEL_NOT_FOUND', async () => {
    p.schoolLevel.findFirst.mockResolvedValue(null);
    await expect(new CreateClassroomUseCase().execute({ levelId: 'x', name: '5-A' }, 'u0')).rejects.toMatchObject({ code: 'LEVEL_NOT_FOUND' });
  });
  it('öğretmen sınıf oluşturamaz → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'TEACHER' });
    await expect(new CreateClassroomUseCase().execute({ levelId: 'lv1', name: '5-A' }, 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
  it('başarı: şube/gradeLevel seviyeden türetilir', async () => {
    const r = await new CreateClassroomUseCase().execute({ levelId: 'lv1', name: '5-A' }, 'u0');
    expect(r.name).toBe('5-A'); expect(r.gradeLevel).toBe(5); expect(r.branchId).toBe('b1'); expect(r.levelId).toBe('lv1');
  });
});

describe('AssignClassroomAdminUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(admin);
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1' });
    p.classroom.update.mockResolvedValue({});
  });
  it('sınıf yoksa → CLASSROOM_NOT_FOUND', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    await expect(new AssignClassroomAdminUseCase().execute('x', { schoolUserId: 't1' }, 'u0')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });
  it('başarı: öğretmen sınıfa atanır (adminUserId = userId)', async () => {
    p.schoolUser.findFirst.mockResolvedValueOnce(admin).mockResolvedValueOnce({ userId: 'u-teacher' });
    const r = await new AssignClassroomAdminUseCase().execute('c1', { schoolUserId: 't1' }, 'u0');
    expect(r).toEqual({ ok: true });
    expect(p.classroom.update).toHaveBeenCalledWith(expect.objectContaining({ data: { adminUserId: 'u-teacher' } }));
  });
});

describe('AssignStudentsToClassroomUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(admin);
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1' });
    p.schoolUser.updateMany.mockResolvedValue({ count: 2 });
  });

  it('yalnız STUDENT rolündekiler atanır (geçerli yoksa NO_VALID_STUDENTS)', async () => {
    p.schoolUser.findMany.mockResolvedValue([]); // hiç öğrenci eşleşmedi
    await expect(new AssignStudentsToClassroomUseCase().execute('c1', { schoolUserIds: ['x'] }, 'u0')).rejects.toMatchObject({ code: 'NO_VALID_STUDENTS' });
  });
  it('başarı: sınıf+şube atanır', async () => {
    p.schoolUser.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    const r = await new AssignStudentsToClassroomUseCase().execute('c1', { schoolUserIds: ['s1', 's2'] }, 'u0');
    expect(r.assigned).toBe(2);
    expect(p.schoolUser.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ classroomId: 'c1', branchId: 'b1' }) }));
  });
});

describe('CreateDepartmentUseCase (kapsam)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(admin);
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1' });
    p.branch.findFirst.mockResolvedValue({ id: 'b1' });
    p.department.create.mockImplementation(async ({ data }: any) => ({ id: 'd1', ...data }));
  });

  it('seviyeye özel: levelId → branchId seviyeden türetilir', async () => {
    const r = await new CreateDepartmentUseCase().execute({ name: 'Mat', subject: 'Matematik', levelId: 'lv1' }, 'u0');
    expect(r.levelId).toBe('lv1'); expect(r.branchId).toBe('b1');
  });
  it('şube geneli: branchId → levelId null', async () => {
    const r = await new CreateDepartmentUseCase().execute({ name: 'Mat', subject: 'Matematik', branchId: 'b1' }, 'u0');
    expect(r.branchId).toBe('b1'); expect(r.levelId).toBeNull();
  });
  it('tüm okul: kapsam yok → ikisi de null', async () => {
    const r = await new CreateDepartmentUseCase().execute({ name: 'Mat', subject: 'Matematik' }, 'u0');
    expect(r.branchId).toBeNull(); expect(r.levelId).toBeNull();
  });
  it('şube yöneticisi tüm-okul zümresi açamaz → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'BRANCH_ADMIN', branchId: 'b1' });
    await expect(new CreateDepartmentUseCase().execute({ name: 'Mat', subject: 'Matematik' }, 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('AssignDepartmentMembersUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(admin);
    p.department.findFirst.mockResolvedValue({ id: 'd1' });
    p.$transaction.mockImplementation(async (fn: any) => fn({
      schoolUser: { updateMany: jest.fn(), update: jest.fn() },
      department: { update: jest.fn() },
    }));
  });

  it('başkan, atanan öğretmenlerden değilse → INVALID_HEAD', async () => {
    p.schoolUser.findMany.mockResolvedValue([{ id: 't1', userId: 'u1' }]);
    await expect(new AssignDepartmentMembersUseCase().execute('d1', { schoolUserIds: ['t1'], headSchoolUserId: 'other' }, 'u0')).rejects.toMatchObject({ code: 'INVALID_HEAD' });
  });
  it('başarı: üyeler + başkan atanır', async () => {
    p.schoolUser.findMany.mockResolvedValue([{ id: 't1', userId: 'u1' }, { id: 't2', userId: 'u2' }]);
    const r = await new AssignDepartmentMembersUseCase().execute('d1', { schoolUserIds: ['t1', 't2'], headSchoolUserId: 't1' }, 'u0');
    expect(r.assigned).toBe(2);
  });
});

describe('GetSchoolQuotaUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(admin); });
  it('kalan kullanıcı + canlı kotası hesaplanır', async () => {
    p.school.findUnique.mockResolvedValue({ maxUsers: 100, annualLiveLimit: 10, usedLiveCount: 4 });
    p.schoolUser.count.mockResolvedValue(30);
    const r = await new GetSchoolQuotaUseCase().execute('u0');
    expect(r).toMatchObject({ maxUsers: 100, usedUsers: 30, remainingUsers: 70, annualLiveLimit: 10, usedLiveCount: 4, remainingLive: 6 });
  });
});
