/**
 * E-Sınıf sınırlı yönetim — alt roller kendi alanında write yapabilir:
 * seviye sorumlusu → sınıf ekle; sınıf öğretmeni → öğrenci ata/Excel; zümre başkanı → üye ata.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    schoolLevel: { findFirst: jest.fn() },
    classroom: { findFirst: jest.fn(), create: jest.fn() },
    department: { findFirst: jest.fn() },
    school: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { CreateClassroomUseCase, AssignStudentsToClassroomUseCase, AssignDepartmentMembersUseCase } from '../../../src/application/use-cases/school/SchoolOrgUseCases';
import { BulkCreateStudentsUseCase } from '../../../src/application/use-cases/school/SchoolUserUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
// actorId 'uT' → ctx.userId = 'uT' (resolveSchoolContext userId = param)
const teacherCtx = { id: 'suT', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: null, classroomId: null };
const deptHeadCtx = { id: 'suH', schoolId: 'sch1', schoolRole: 'DEPT_HEAD', branchId: null, departmentId: 'd1', classroomId: null };

beforeEach(() => jest.clearAllMocks());

describe('Seviye sorumlusu — sınıf ekleme', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(teacherCtx));
  it('kendi seviyesine sınıf ekleyebilir', async () => {
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1', gradeLevel: 5, adminUserId: 'uT' });
    p.classroom.create.mockImplementation(async ({ data }: any) => ({ id: 'c1', ...data }));
    const r = await new CreateClassroomUseCase().execute({ levelId: 'lv1', name: '5-A' }, 'uT');
    expect(r).toMatchObject({ name: '5-A', levelId: 'lv1', branchId: 'b1' });
  });
  it('başka seviyeye ekleyemez → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1', gradeLevel: 5, adminUserId: 'other' });
    await expect(new CreateClassroomUseCase().execute({ levelId: 'lv1', name: '5-A' }, 'uT')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('Sınıf öğretmeni — öğrenci atama', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(teacherCtx));
  it('kendi sınıfına öğrenci atayabilir', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: 'uT', level: { adminUserId: 'x' } });
    p.schoolUser.findMany.mockResolvedValue([{ id: 's1' }]);
    p.schoolUser.updateMany.mockResolvedValue({ count: 1 });
    const r = await new AssignStudentsToClassroomUseCase().execute('c1', { schoolUserIds: ['s1'] }, 'uT');
    expect(r).toEqual({ assigned: 1 });
  });
  it('başkasının sınıfına atayamaz → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: 'other', level: { adminUserId: 'y' } });
    await expect(new AssignStudentsToClassroomUseCase().execute('c1', { schoolUserIds: ['s1'] }, 'uT')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('Sınıf öğretmeni — Excel öğrenci içe aktarma', () => {
  beforeEach(() => {
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);
    p.school.findUnique.mockResolvedValue({ id: 'sch1', code: 'ANK', tenantId: 'ten1', maxUsers: 100 });
    p.schoolUser.count.mockResolvedValue(0);
    let seq = 0;
    p.$transaction.mockImplementation(async (fn: any) => fn({
      schoolUser: { count: jest.fn(async () => seq), findUnique: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => { seq++; return { id: `su-${seq}`, username: data.username }; }) },
      user: { create: jest.fn(async () => ({ id: 'u-x' })) },
    }));
  });
  it('kendi sınıfına Excel öğrenci ekleyebilir', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: 'uT', level: { adminUserId: 'x' } });
    const r = await new BulkCreateStudentsUseCase().execute('c1', { students: [{ firstName: 'Ali', lastName: 'V', studentNo: '101' }] }, 'uT');
    expect(r.count).toBe(1);
    expect(r.created[0]).toMatchObject({ name: 'Ali V', studentNo: '101' });
  });
  it('başka sınıfa ekleyemez → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: 'other', level: { adminUserId: 'y' } });
    await expect(new BulkCreateStudentsUseCase().execute('c1', { students: [{ firstName: 'A' }] }, 'uT')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('Zümre başkanı — üye atama', () => {
  beforeEach(() => {
    p.schoolUser.findFirst.mockResolvedValue(deptHeadCtx);
    p.$transaction.mockImplementation(async (fn: any) => fn({
      schoolUser: { updateMany: jest.fn(), update: jest.fn() },
      department: { update: jest.fn() },
    }));
  });
  it('kendi zümresine öğretmen atayabilir', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: 'b1', headUserId: 'uH' });
    p.schoolUser.findMany
      .mockResolvedValueOnce([{ id: 't1', userId: 'u1' }])  // valid (desired)
      .mockResolvedValueOnce([]);                            // current members
    const r = await new AssignDepartmentMembersUseCase().execute('d1', { schoolUserIds: ['t1'] }, 'uH');
    expect(r).toMatchObject({ assigned: 1 });
  });
  it('başka zümreye atayamaz → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: 'b1', headUserId: 'other' });
    await expect(new AssignDepartmentMembersUseCase().execute('d1', { schoolUserIds: ['t1'] }, 'uH')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});
