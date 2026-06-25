/**
 * E-Sınıf org use-case'leri (ek kapsam): şube, seviye/sınıf admin+sil, ağaçlar,
 * zümre liste/tree/sil/üye-listesi, ders havuzu.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    branch: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    schoolLevel: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    classroom: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    department: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    schoolSubject: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));

import {
  CreateBranchUseCase, ListBranchesUseCase, AssignBranchAdminUseCase,
  AssignLevelAdminUseCase, DeleteLevelUseCase, DeleteClassroomUseCase,
  GetSchoolTreeUseCase, ListDepartmentsUseCase, GetDepartmentTreeUseCase,
  DeleteDepartmentUseCase, GetDepartmentMembersUseCase,
  CreateSubjectUseCase, ListSubjectsUseCase, DeleteSubjectUseCase,
} from '../../../src/application/use-cases/school/SchoolOrgUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const admin = { id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(admin);
  p.schoolUser.findUnique.mockResolvedValue({ userId: 'u0', departmentId: null });
  p.schoolLevel.findMany.mockResolvedValue([]);
  p.classroom.findMany.mockResolvedValue([]);
  p.department.findMany.mockResolvedValue([]);
});

describe('CreateBranchUseCase', () => {
  it('ad boşsa NAME_REQUIRED', async () => {
    await expect(new CreateBranchUseCase().execute({ name: ' ' }, 'u0')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
  it('başarı', async () => {
    p.branch.create.mockResolvedValue({ id: 'b1', name: 'Ankara' });
    const r = await new CreateBranchUseCase().execute({ name: 'Ankara' }, 'u0');
    expect(r.id).toBe('b1');
  });
});

describe('ListBranchesUseCase', () => {
  it('şube listesi (sınıf sayısı + admin)', async () => {
    p.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'B1', adminUser: { username: 'ALEF-B-0001' }, _count: { classrooms: 3 }, createdAt: new Date() }]);
    const r = await new ListBranchesUseCase().execute('u0');
    expect(r[0]).toMatchObject({ id: 'b1', adminUsername: 'ALEF-B-0001', classroomCount: 3 });
  });
});

describe('AssignBranchAdminUseCase', () => {
  beforeEach(() => {
    p.branch.findFirst.mockResolvedValue({ id: 'b1' });
    p.$transaction.mockResolvedValue([{}, {}]);
  });
  it('kullanıcı yoksa USER_NOT_FOUND', async () => {
    p.schoolUser.findFirst.mockResolvedValueOnce(admin).mockResolvedValueOnce(null);
    await expect(new AssignBranchAdminUseCase().execute('b1', { schoolUserId: 'x' }, 'u0')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
  it('başarı', async () => {
    p.schoolUser.findFirst.mockResolvedValueOnce(admin).mockResolvedValueOnce({ id: 'su9', userId: 'u9' });
    const r = await new AssignBranchAdminUseCase().execute('b1', { schoolUserId: 'su9' }, 'u0');
    expect(r).toEqual({ ok: true });
  });
});

describe('AssignLevelAdminUseCase', () => {
  it('seviye yoksa LEVEL_NOT_FOUND', async () => {
    p.schoolLevel.findFirst.mockResolvedValue(null);
    await expect(new AssignLevelAdminUseCase().execute('lx', { schoolUserId: 's1' }, 'u0')).rejects.toMatchObject({ code: 'LEVEL_NOT_FOUND' });
  });
  it('başarı: adminUserId set', async () => {
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1' });
    p.schoolUser.findFirst.mockResolvedValueOnce(admin).mockResolvedValueOnce({ userId: 'u9' });
    p.schoolLevel.update.mockResolvedValue({});
    const r = await new AssignLevelAdminUseCase().execute('lv1', { schoolUserId: 's9' }, 'u0');
    expect(r).toEqual({ ok: true });
    expect(p.schoolLevel.update).toHaveBeenCalledWith(expect.objectContaining({ data: { adminUserId: 'u9' } }));
  });
});

describe('DeleteLevelUseCase', () => {
  it('sınıf varsa LEVEL_NOT_EMPTY', async () => {
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1', _count: { classrooms: 2 } });
    await expect(new DeleteLevelUseCase().execute('lv1', 'u0')).rejects.toMatchObject({ code: 'LEVEL_NOT_EMPTY' });
  });
  it('boşsa silinir', async () => {
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1', _count: { classrooms: 0 } });
    p.schoolLevel.delete.mockResolvedValue({});
    const r = await new DeleteLevelUseCase().execute('lv1', 'u0');
    expect(r).toEqual({ ok: true });
  });
});

describe('DeleteClassroomUseCase', () => {
  it('öğrenci varsa CLASSROOM_NOT_EMPTY', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', _count: { students: 4 } });
    await expect(new DeleteClassroomUseCase().execute('c1', 'u0')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_EMPTY' });
  });
  it('boşsa silinir', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', _count: { students: 0 } });
    p.classroom.delete.mockResolvedValue({});
    const r = await new DeleteClassroomUseCase().execute('c1', 'u0');
    expect(r).toEqual({ ok: true });
  });
});

describe('GetSchoolTreeUseCase', () => {
  it('SCHOOL_ADMIN tüm ağacı görür', async () => {
    p.branch.findMany.mockResolvedValue([
      { id: 'b1', name: 'B1', adminUserId: null, adminUser: null, levels: [
        { id: 'lv1', gradeLevel: 5, adminUserId: null, adminUser: null, classrooms: [
          { id: 'c1', name: '5-A', gradeLevel: 5, adminUserId: null, adminUser: null, _count: { students: 2 } },
        ] },
      ] },
    ]);
    const r = await new GetSchoolTreeUseCase().execute('u0');
    expect(r[0].levels[0].classrooms[0]).toMatchObject({ id: 'c1', studentCount: 2 });
  });
  it('kapsam boşsa boş dizi', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'TEACHER' });
    const r = await new GetSchoolTreeUseCase().execute('u0');
    expect(r).toEqual([]);
  });
});

describe('ListDepartmentsUseCase', () => {
  it('kapsam etiketli liste', async () => {
    p.department.findMany.mockResolvedValue([
      { id: 'd1', name: 'Mat', subject: 'Matematik', levelId: null, branchId: 'b1', headUser: { username: 'h' }, level: null, branch: { name: 'B1' }, _count: { members: 2 }, createdAt: new Date() },
    ]);
    const r = await new ListDepartmentsUseCase().execute('u0');
    expect(r[0]).toMatchObject({ id: 'd1', scope: 'BRANCH', branchName: 'B1', memberCount: 2 });
  });
});

describe('GetDepartmentTreeUseCase', () => {
  it('tüm okul + şube/seviye kırılımı', async () => {
    p.department.findMany.mockResolvedValue([
      { id: 'd0', name: 'Genel', subject: 'Rehberlik', branchId: null, levelId: null, headUser: null, _count: { members: 0 } },
      { id: 'd1', name: 'Mat', subject: 'Matematik', branchId: 'b1', levelId: null, headUser: null, _count: { members: 1 } },
      { id: 'd2', name: '5-Mat', subject: 'Matematik', branchId: 'b1', levelId: 'lv1', headUser: { username: 'h', firstName: null, lastName: null }, _count: { members: 1 } },
    ]);
    p.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'B1', levels: [{ id: 'lv1', gradeLevel: 5 }] }]);
    const r = await new GetDepartmentTreeUseCase().execute('u0');
    expect(r.schoolWide).toHaveLength(1);
    expect(r.branches[0].departments).toHaveLength(1);            // şube geneli
    expect(r.branches[0].levels[0].departments).toHaveLength(1);  // seviyeye özel
  });
});

describe('DeleteDepartmentUseCase', () => {
  it('öğretmen varsa DEPARTMENT_NOT_EMPTY', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: 'b1', _count: { members: 3 } });
    await expect(new DeleteDepartmentUseCase().execute('d1', 'u0')).rejects.toMatchObject({ code: 'DEPARTMENT_NOT_EMPTY' });
  });
  it('boşsa silinir', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: 'b1', _count: { members: 0 } });
    p.department.delete.mockResolvedValue({});
    const r = await new DeleteDepartmentUseCase().execute('d1', 'u0');
    expect(r).toEqual({ ok: true });
  });
});

describe('GetDepartmentMembersUseCase', () => {
  it('adaylar + inDept/isHead bayrakları', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: 'b1', headUserId: 'u9' });
    p.schoolUser.findMany.mockResolvedValue([
      { id: 't1', userId: 'u9', username: 'T1', departmentId: 'd1', user: { firstName: 'A', lastName: 'B' }, department: { name: 'Mat' } },
      { id: 't2', userId: 'u8', username: 'T2', departmentId: 'd2', user: { firstName: null, lastName: null }, department: { name: 'Fizik' } },
    ]);
    const r = await new GetDepartmentMembersUseCase().execute('d1', 'u0');
    expect(r.candidates[0]).toMatchObject({ id: 't1', inDept: true, isHead: true, fullName: 'A B' });
    expect(r.candidates[1]).toMatchObject({ id: 't2', inDept: false, isHead: false, otherDept: 'Fizik' });
  });
});

describe('Ders havuzu', () => {
  it('CreateSubject: zaten varsa SUBJECT_EXISTS', async () => {
    p.schoolSubject.findUnique.mockResolvedValue({ id: 's1' });
    await expect(new CreateSubjectUseCase().execute({ name: 'Matematik' }, 'u0')).rejects.toMatchObject({ code: 'SUBJECT_EXISTS' });
  });
  it('CreateSubject başarı', async () => {
    p.schoolSubject.findUnique.mockResolvedValue(null);
    p.schoolSubject.create.mockResolvedValue({ id: 's1', name: 'Matematik' });
    const r = await new CreateSubjectUseCase().execute({ name: 'Matematik' }, 'u0');
    expect(r).toEqual({ id: 's1', name: 'Matematik' });
  });
  it('ListSubjects', async () => {
    p.schoolSubject.findMany.mockResolvedValue([{ id: 's1', name: 'Matematik' }]);
    const r = await new ListSubjectsUseCase().execute('u0');
    expect(r).toHaveLength(1);
  });
  it('DeleteSubject: yoksa SUBJECT_NOT_FOUND', async () => {
    p.schoolSubject.findFirst.mockResolvedValue(null);
    await expect(new DeleteSubjectUseCase().execute('sx', 'u0')).rejects.toMatchObject({ code: 'SUBJECT_NOT_FOUND' });
  });
  it('DeleteSubject başarı', async () => {
    p.schoolSubject.findFirst.mockResolvedValue({ id: 's1' });
    p.schoolSubject.delete.mockResolvedValue({});
    const r = await new DeleteSubjectUseCase().execute('s1', 'u0');
    expect(r).toEqual({ ok: true });
  });
});
