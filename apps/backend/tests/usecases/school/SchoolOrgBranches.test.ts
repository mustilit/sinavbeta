/**
 * E-Sınıf SchoolOrg — branch (dal) kapsamı için kenar testleri.
 * Eksik isim (?? '' savunma), BRANCH_ADMIN rol dalları + branchId-null (?? '__none__'),
 * null ilişki (adminUser/branch/headUser/user ?? null), not-found, kapsam dalları.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn(async () => ({ userId: 'u0', departmentId: null })), findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })), update: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    branch: { findFirst: jest.fn(), findMany: jest.fn(async () => []), create: jest.fn(async ({ data }: any) => ({ id: 'b1', ...data })), update: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    schoolLevel: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(async () => []), create: jest.fn(async ({ data }: any) => ({ id: 'lv1', ...data })), update: jest.fn(async () => ({})), delete: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    classroom: { findFirst: jest.fn(), findMany: jest.fn(async () => []), create: jest.fn(async ({ data }: any) => ({ id: 'c1', ...data })), update: jest.fn(async ({ data }: any) => ({ id: 'c1', ...data })), delete: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    department: { findFirst: jest.fn(), findMany: jest.fn(async () => []), create: jest.fn(async ({ data }: any) => ({ id: 'd1', ...data })), update: jest.fn(async () => ({})), delete: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    schoolSubject: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []), create: jest.fn(async ({ data }: any) => ({ id: 's1', ...data })), delete: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    topic: { findMany: jest.fn(async () => []) },
    school: { findUnique: jest.fn(async () => ({ maxUsers: 100, annualLiveLimit: 10, usedLiveCount: 0 })) },
    schoolAssignment: { count: jest.fn(async () => 0) },
    schoolExam: { count: jest.fn(async () => 0) },
    liveSession: { count: jest.fn(async () => 0) },
    $transaction: jest.fn(async (arg: any) => {
      if (typeof arg === 'function') {
        return arg({
          schoolUser: { updateMany: jest.fn(async () => ({ count: 0 })), update: jest.fn(async () => ({})) },
          department: { update: jest.fn(async () => ({})) },
        });
      }
      return Promise.all(arg);
    }),
  },
}));

import * as Org from '../../../src/application/use-cases/school/SchoolOrgUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const ctxOf = (over: any = {}) => ({ id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(ctxOf());
  p.schoolUser.findUnique.mockResolvedValue({ userId: 'u0', departmentId: null });
  p.schoolLevel.findMany.mockResolvedValue([]);
  p.classroom.findMany.mockResolvedValue([]);
  p.department.findMany.mockResolvedValue([]);
});

describe('CreateBranch / CreateClassroom / CreateDepartment / CreateSubject — isim ?? "" savunma', () => {
  it('CreateBranch: name undefined → NAME_REQUIRED (?? "")', async () => {
    await expect(new Org.CreateBranchUseCase().execute({} as any, 'u0')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
  it('CreateClassroom: name undefined → NAME_REQUIRED', async () => {
    await expect(new Org.CreateClassroomUseCase().execute({ levelId: 'lv1' } as any, 'u0')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
  it('CreateDepartment: name undefined → NAME_REQUIRED', async () => {
    await expect(new Org.CreateDepartmentUseCase().execute({ subject: 'Mat' } as any, 'u0')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
  it('CreateDepartment: subject undefined → SUBJECT_REQUIRED', async () => {
    await expect(new Org.CreateDepartmentUseCase().execute({ name: 'Z' } as any, 'u0')).rejects.toMatchObject({ code: 'SUBJECT_REQUIRED' });
  });
  it('CreateSubject: name undefined → NAME_REQUIRED', async () => {
    await expect(new Org.CreateSubjectUseCase().execute({} as any, 'u0')).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
});

describe('ListBranches — BRANCH_ADMIN + null adminUser', () => {
  it('BRANCH_ADMIN (branchId dolu) yalnız kendi şubesi; adminUser null → username null', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'B1', adminUser: null, _count: { classrooms: 0 }, createdAt: new Date() }]);
    const r = await new Org.ListBranchesUseCase().execute('u0');
    expect(r[0].adminUsername).toBeNull();
    expect(p.branch.findMany.mock.calls[0][0].where.id).toBe('b1');
  });
  it('BRANCH_ADMIN branchId null → __none__', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: null }));
    p.branch.findMany.mockResolvedValue([]);
    await new Org.ListBranchesUseCase().execute('u0');
    expect(p.branch.findMany.mock.calls[0][0].where.id).toBe('__none__');
  });
});

describe('AssignBranchAdmin / AssignLevelAdmin — not-found + BRANCH_ADMIN', () => {
  it('AssignBranchAdmin: şube yok → BRANCH_NOT_FOUND', async () => {
    p.branch.findFirst.mockResolvedValue(null);
    await expect(new Org.AssignBranchAdminUseCase().execute('bX', { schoolUserId: 's1' }, 'u0')).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
  });
  it('AssignLevelAdmin: seviye yok → LEVEL_NOT_FOUND', async () => {
    p.schoolLevel.findFirst.mockResolvedValue(null);
    await expect(new Org.AssignLevelAdminUseCase().execute('lvX', { schoolUserId: 's1' }, 'u0')).rejects.toMatchObject({ code: 'LEVEL_NOT_FOUND' });
  });
  it('AssignLevelAdmin: BRANCH_ADMIN başka şube → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b2' });
    await expect(new Org.AssignLevelAdminUseCase().execute('lv1', { schoolUserId: 's1' }, 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('DeleteLevel — seviye yok', () => {
  it('seviye null → LEVEL_NOT_FOUND', async () => {
    p.schoolLevel.findFirst.mockResolvedValue(null);
    await expect(new Org.DeleteLevelUseCase().execute('lvX', 'u0')).rejects.toMatchObject({ code: 'LEVEL_NOT_FOUND' });
  });
});

describe('CreateLevel — BRANCH_ADMIN başka şube', () => {
  it('BRANCH_ADMIN farklı şubeye seviye → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.branch.findFirst.mockResolvedValue({ id: 'b2' });
    await expect(new Org.CreateLevelUseCase().execute({ branchId: 'b2', gradeLevel: 5 }, 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('AssignClassroomAdmin / DeleteClassroom — seviye sorumlusu + null level', () => {
  it('AssignClassroomAdmin: seviye sorumlusu (level.adminUserId == kendi) izinli', async () => {
    // findFirst #1: resolveSchoolContext (TEACHER ctx) → ctx.userId='u0'; #2: hedef kullanıcı
    p.schoolUser.findFirst.mockResolvedValueOnce(ctxOf({ schoolRole: 'TEACHER' })).mockResolvedValueOnce({ userId: 'tX' });
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'bX', level: { adminUserId: 'u0' } });
    const r = await new Org.AssignClassroomAdminUseCase().execute('c1', { schoolUserId: 's1' }, 'u0');
    expect(r).toEqual({ ok: true });
  });
  it('DeleteClassroom: sınıf yok → CLASSROOM_NOT_FOUND', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    await expect(new Org.DeleteClassroomUseCase().execute('cX', 'u0')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });
  it('DeleteClassroom: yetkisiz öğretmen (level null) → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER' }));
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'bX', level: null, _count: { students: 0 } });
    await expect(new Org.DeleteClassroomUseCase().execute('c1', 'uT')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('AssignStudents / RemoveStudents — not-found + boş liste', () => {
  it('AssignStudents: sınıf yok → CLASSROOM_NOT_FOUND', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    await expect(new Org.AssignStudentsToClassroomUseCase().execute('cX', { schoolUserIds: ['s1'] }, 'u0')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });
  it('AssignStudents: schoolUserIds undefined → NO_STUDENTS (?? [])', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: null, level: { adminUserId: null } });
    await expect(new Org.AssignStudentsToClassroomUseCase().execute('c1', {} as any, 'u0')).rejects.toMatchObject({ code: 'NO_STUDENTS' });
  });
  it('RemoveStudents: schoolUserIds undefined → NO_STUDENTS (?? [])', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: null, level: { adminUserId: null } });
    await expect(new Org.RemoveStudentsFromClassroomUseCase().execute('c1', {} as any, 'u0')).rejects.toMatchObject({ code: 'NO_STUDENTS' });
  });
});

describe('CreateDepartment — kapsam dalları', () => {
  it('levelId verildi ama seviye yok → LEVEL_NOT_FOUND', async () => {
    p.schoolLevel.findFirst.mockResolvedValue(null);
    await expect(new Org.CreateDepartmentUseCase().execute({ name: 'Z', subject: 'Mat', levelId: 'lvX' }, 'u0')).rejects.toMatchObject({ code: 'LEVEL_NOT_FOUND' });
  });
  it('branchId verildi ama şube yok → BRANCH_NOT_FOUND', async () => {
    p.branch.findFirst.mockResolvedValue(null);
    await expect(new Org.CreateDepartmentUseCase().execute({ name: 'Z', subject: 'Mat', branchId: 'bX' }, 'u0')).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
  });
  it('BRANCH_ADMIN okul-geneli zümre açamaz → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    await expect(new Org.CreateDepartmentUseCase().execute({ name: 'Z', subject: 'Mat' }, 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
  it('levelId ile seviyeye özel zümre oluşur', async () => {
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1' });
    const r = await new Org.CreateDepartmentUseCase().execute({ name: 'Z', subject: 'Mat', levelId: 'lv1' }, 'u0');
    expect(r).toMatchObject({ levelId: 'lv1', branchId: 'b1' });
  });
});

describe('ListDepartments — scope etiketi + null ilişkiler', () => {
  it('LEVEL / BRANCH / SCHOOL kapsamları + null branch/headUser', async () => {
    p.department.findMany.mockResolvedValue([
      { id: 'd1', name: 'A', subject: 'Mat', levelId: 'lv1', branchId: 'b1', level: { gradeLevel: 5 }, branch: { name: 'B1' }, headUser: { username: 'h1' }, _count: { members: 1 }, createdAt: new Date() },
      { id: 'd2', name: 'B', subject: 'Fen', levelId: null, branchId: 'b1', level: null, branch: { name: 'B1' }, headUser: null, _count: { members: 0 }, createdAt: new Date() },
      { id: 'd3', name: 'C', subject: 'Tarih', levelId: null, branchId: null, level: null, branch: null, headUser: null, _count: { members: 0 }, createdAt: new Date() },
    ]);
    const r = await new Org.ListDepartmentsUseCase().execute('u0');
    expect(r.map((d: any) => d.scope)).toEqual(['LEVEL', 'BRANCH', 'SCHOOL']);
    expect(r[2]).toMatchObject({ branchName: null, headUsername: null, gradeLevel: null });
  });
});

describe('DeleteDepartment / GetDepartmentMembers — not-found + BRANCH_ADMIN + otherDept', () => {
  it('DeleteDepartment: zümre yok → DEPARTMENT_NOT_FOUND', async () => {
    p.department.findFirst.mockResolvedValue(null);
    await expect(new Org.DeleteDepartmentUseCase().execute('dX', 'u0')).rejects.toMatchObject({ code: 'DEPARTMENT_NOT_FOUND' });
  });
  it('DeleteDepartment: BRANCH_ADMIN başka şube → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: 'b2', _count: { members: 0 } });
    await expect(new Org.DeleteDepartmentUseCase().execute('d1', 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
  it('GetDepartmentMembers: zümre yok → DEPARTMENT_NOT_FOUND', async () => {
    p.department.findFirst.mockResolvedValue(null);
    await expect(new Org.GetDepartmentMembersUseCase().execute('dX', 'u0')).rejects.toMatchObject({ code: 'DEPARTMENT_NOT_FOUND' });
  });
  it('GetDepartmentMembers: başka zümredeki öğretmen otherDept etiketi', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: null, headUserId: 'uH' });
    p.schoolUser.findMany.mockResolvedValue([
      { id: 't1', userId: 'uH', username: 'h1', departmentId: 'd1', user: { firstName: 'A', lastName: 'B' }, department: { name: 'D1' } },          // inDept + isHead
      { id: 't2', userId: 'u2', username: 't2', departmentId: 'd2', user: { firstName: null, lastName: null }, department: { name: 'Başka' } },     // otherDept
      { id: 't3', userId: 'u3', username: 't3', departmentId: null, user: null, department: null },                                                  // hiç zümre yok
    ]);
    const r = await new Org.GetDepartmentMembersUseCase().execute('d1', 'u0');
    expect(r.candidates[0]).toMatchObject({ inDept: true, isHead: true });
    expect(r.candidates[1].otherDept).toBe('Başka');
    expect(r.candidates[2].otherDept).toBeNull();
  });
});

describe('AssignDepartmentMembers — not-found + boş + invalid + head', () => {
  it('zümre yok → DEPARTMENT_NOT_FOUND', async () => {
    p.department.findFirst.mockResolvedValue(null);
    await expect(new Org.AssignDepartmentMembersUseCase().execute('dX', { schoolUserIds: [] }, 'u0')).rejects.toMatchObject({ code: 'DEPARTMENT_NOT_FOUND' });
  });
  it('geçersiz üye → INVALID_MEMBERS', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: null, headUserId: null });
    p.schoolUser.findMany.mockResolvedValue([{ id: 't1', userId: 'u1' }]); // 1 geçerli ama 2 istendi
    await expect(new Org.AssignDepartmentMembersUseCase().execute('d1', { schoolUserIds: ['t1', 't2'] }, 'u0')).rejects.toMatchObject({ code: 'INVALID_MEMBERS' });
  });
  it('başkan atanan listede değil → INVALID_HEAD', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: null, headUserId: null });
    p.schoolUser.findMany.mockResolvedValue([{ id: 't1', userId: 'u1' }]);
    await expect(new Org.AssignDepartmentMembersUseCase().execute('d1', { schoolUserIds: ['t1'], headSchoolUserId: 'tX' }, 'u0')).rejects.toMatchObject({ code: 'INVALID_HEAD' });
  });
  it('başarı: üye + başkan senkronlanır', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: null, headUserId: null });
    p.schoolUser.findMany
      .mockResolvedValueOnce([{ id: 't1', userId: 'u1' }])  // valid (desired)
      .mockResolvedValueOnce([{ id: 't1' }]);               // current
    const r = await new Org.AssignDepartmentMembersUseCase().execute('d1', { schoolUserIds: ['t1'], headSchoolUserId: 't1' }, 'u0');
    expect(r).toMatchObject({ assigned: 1 });
  });
  it('boş küme → tüm üyeler çıkarılır (?? [] + toRemove)', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: null, headUserId: null });
    // desiredIds boş → valid sorgusu ATLANIR; tek findMany çağrısı = current
    p.schoolUser.findMany.mockResolvedValue([{ id: 'tOld' }]);
    const r = await new Org.AssignDepartmentMembersUseCase().execute('d1', {} as any, 'u0');
    expect(r).toMatchObject({ assigned: 0, removed: 1 });
  });
});

describe('AssignClassroomAdmin — FORBIDDEN (yetkisiz öğretmen)', () => {
  it('TEACHER, sınıf seviyesi sorumlusu değil → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER' }));
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'bX', level: { adminUserId: 'other' } });
    await expect(new Org.AssignClassroomAdminUseCase().execute('c1', { schoolUserId: 's1' }, 'uT')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('CreateDepartment — BRANCH_ADMIN levelId başka şube (400 branch)', () => {
  it('BRANCH_ADMIN, levelId başka şubeye ait → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b2' }); // farklı şube
    await expect(new Org.CreateDepartmentUseCase().execute({ name: 'Z', subject: 'Mat', levelId: 'lv1' }, 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('GetDepartmentMembers — otherDept department null (561 branch)', () => {
  it('başka zümrede ama department adı null → otherDept null', async () => {
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: null, headUserId: null });
    p.schoolUser.findMany.mockResolvedValue([
      { id: 't2', userId: 'u2', username: 't2', departmentId: 'd2', user: null, department: null }, // departmentId var, department null → ?? null
    ]);
    const r = await new Org.GetDepartmentMembersUseCase().execute('d1', 'u0');
    expect(r.candidates[0].otherDept).toBeNull();
  });
});

describe('GetSchoolTreeUseCase', () => {
  it('admin: tüm okul; null admin → adminLabel null; dolu admin → ad/username', async () => {
    p.branch.findMany.mockResolvedValue([{
      id: 'b1', name: 'B1', adminUserId: null, adminUser: null, levels: [{
        id: 'lv1', gradeLevel: 5, adminUserId: 'uL', adminUser: { username: 'lh', firstName: null, lastName: null },
        classrooms: [{ id: 'c1', name: '5-A', gradeLevel: 5, isActive: true, adminUserId: null, adminUser: null, _count: { students: 3 } }],
      }],
    }]);
    const r = await new Org.GetSchoolTreeUseCase().execute('u0');
    expect(r[0].adminLabel).toBeNull();           // branch adminUser null
    expect(r[0].levels[0].adminLabel).toBe('lh');  // firstName/lastName null → username
    expect(r[0].levels[0].classrooms[0].adminLabel).toBeNull();
  });
  it('BRANCH_ADMIN: kendi şubesi (fullBranchSet)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'B1', adminUserId: null, adminUser: null, levels: [] }]);
    const r = await new Org.GetSchoolTreeUseCase().execute('u0');
    expect(r[0].id).toBe('b1');
    expect(p.branch.findMany.mock.calls[0][0].where.id).toEqual({ in: ['b1'] });
  });
  it('sınıf öğretmeni: solo sınıf filtresi + kapsam dışı seviye/şube elenir', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER' }));
    p.schoolLevel.findMany.mockResolvedValue([]);                       // seviye sorumlusu değil
    p.classroom.findMany.mockResolvedValue([{ id: 'c1', branchId: 'b1' }]); // sınıf öğretmeni → solo
    p.branch.findMany.mockResolvedValue([
      { id: 'b1', name: 'B1', adminUserId: null, adminUser: null, levels: [{
        id: 'lv1', gradeLevel: 5, adminUserId: null, adminUser: null,
        classrooms: [
          { id: 'c1', name: '5-A', gradeLevel: 5, isActive: true, adminUserId: null, adminUser: null, _count: { students: 1 } }, // solo
          { id: 'c2', name: '5-B', gradeLevel: 5, isActive: true, adminUserId: null, adminUser: null, _count: { students: 1 } }, // solo değil → filtrelenir
        ],
      }] },
      { id: 'b2', name: 'B2', adminUserId: null, adminUser: null, levels: [{
        id: 'lv9', gradeLevel: 9, adminUserId: null, adminUser: null,
        classrooms: [{ id: 'c9', name: '9-A', gradeLevel: 9, isActive: true, adminUserId: null, adminUser: null, _count: { students: 1 } }], // solo değil → seviye boş → şube elenir
      }] },
    ]);
    const r = await new Org.GetSchoolTreeUseCase().execute('uT');
    expect(r).toHaveLength(1);                       // b2 kapsam dışı → elendi (280)
    expect(r[0].levels[0].classrooms.map((c: any) => c.id)).toEqual(['c1']); // c2 filtrelendi (262)
  });
  it('hiç kapsam yoksa → []', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER' }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    const r = await new Org.GetSchoolTreeUseCase().execute('uT');
    expect(r).toEqual([]);
  });
});

describe('GetDepartmentTreeUseCase', () => {
  it('admin: tüm yapı; boş seviye (?? []) + üye user null (484)', async () => {
    p.department.findMany.mockResolvedValue([
      { id: 'd1', name: 'A', subject: 'Mat', levelId: 'lv1', branchId: 'b1', headUserId: 'uH', headUser: { username: 'h', firstName: null, lastName: null }, members: [{ username: 'm1', user: { firstName: 'X', lastName: 'Y' } }, { username: 'm2', user: null }], _count: { members: 2 } },
      { id: 'd2', name: 'B', subject: 'Fen', levelId: null, branchId: 'b1', headUserId: null, headUser: null, members: [], _count: { members: 0 } },
      { id: 'd3', name: 'C', subject: 'Tarih', levelId: null, branchId: null, headUserId: null, headUser: null, members: [], _count: { members: 0 } },
    ]);
    p.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'B1', levels: [{ id: 'lv1', gradeLevel: 5 }, { id: 'lv2', gradeLevel: 6 }] }]);
    const r = await new Org.GetDepartmentTreeUseCase().execute('u0');
    expect(r.schoolWide).toHaveLength(1);
    const b1 = r.branches[0];
    expect(b1.levels.find((l: any) => l.id === 'lv2').departments).toEqual([]); // boş seviye ?? []
    expect(b1.levels.find((l: any) => l.id === 'lv1').departments[0].members).toEqual(['X Y', 'm2']); // m2 user null → username
  });
  it('BRANCH_ADMIN: kendi şubesi (456 or.push + 505/506 branchWhere)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]) // headed
      .mockResolvedValueOnce([{ id: 'd2', name: 'B', subject: 'Fen', levelId: null, branchId: 'b1', headUserId: null, headUser: null, members: [], _count: { members: 0 } }]); // depts
    p.branch.findMany.mockResolvedValue([{ id: 'b1', name: 'B1', levels: [] }]);
    const r = await new Org.GetDepartmentTreeUseCase().execute('u0');
    expect(r.branches[0].id).toBe('b1');
    expect(p.branch.findMany.mock.calls[0][0].where.id).toBe('b1');
  });
  it('BRANCH_ADMIN branchId null ama zümre başkanı → branchWhere ?? __none__ (506 null)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: null }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([{ id: 'dH' }]) // headed → or non-empty
      .mockResolvedValueOnce([{ id: 'dH', name: 'H', subject: 'X', levelId: null, branchId: null, headUserId: null, headUser: null, members: [], _count: { members: 0 } }]);
    p.branch.findMany.mockResolvedValue([]);
    await new Org.GetDepartmentTreeUseCase().execute('u0');
    expect(p.branch.findMany.mock.calls[0][0].where.id).toBe('__none__');
  });
  it('TEACHER okul-geneli zümre üyesi → shownBranchIds boş → __none__ (507)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: 'd1' }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]) // headed
      .mockResolvedValueOnce([{ id: 'd1', name: 'A', subject: 'Mat', levelId: null, branchId: null, headUserId: null, headUser: null, members: [], _count: { members: 0 } }]); // okul-geneli
    p.branch.findMany.mockResolvedValue([]);
    await new Org.GetDepartmentTreeUseCase().execute('uT');
    expect(p.branch.findMany.mock.calls[0][0].where.id).toEqual({ in: ['__none__'] });
  });
  it('TEACHER hiç zümre/seviye yok → {schoolWide:[],branches:[]} (464)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    const r = await new Org.GetDepartmentTreeUseCase().execute('uT');
    expect(r).toEqual({ schoolWide: [], branches: [] });
  });
});

describe('GetSchoolQuota — okul yok', () => {
  it('okul null → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new Org.GetSchoolQuotaUseCase().execute('u0')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
});

describe('ListClassrooms — manager + non-manager dalları', () => {
  it('admin + branchId filtresi', async () => {
    p.classroom.findMany.mockResolvedValue([]);
    await new Org.ListClassroomsUseCase().execute({ branchId: 'b1' }, 'u0');
    expect(p.classroom.findMany.mock.calls[0][0].where.branchId).toBe('b1');
  });
  it('BRANCH_ADMIN branchId null → __none__', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: null }));
    p.classroom.findMany.mockResolvedValue([]);
    await new Org.ListClassroomsUseCase().execute({}, 'u0');
    expect(p.classroom.findMany.mock.calls[0][0].where.branchId).toBe('__none__');
  });
  it('non-manager boş kapsam → []', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolUser.findUnique.mockResolvedValue({ userId: 'uT', departmentId: null });
    const r = await new Org.ListClassroomsUseCase().execute({}, 'uT');
    expect(r).toEqual([]);
  });
  it('non-manager (seviye sorumlusu) + branchId → AND', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolUser.findUnique.mockResolvedValue({ userId: 'uT', departmentId: null });
    p.schoolLevel.findMany.mockResolvedValue([{ id: 'lv5' }]); // seviye sorumlusu → kapsam dolu
    p.classroom.findMany.mockResolvedValue([]);
    await new Org.ListClassroomsUseCase().execute({ branchId: 'b1' }, 'uT');
    // resolveSchoolScope da classroom.findMany çağırır → asıl liste sorgusu SON çağrıdır
    expect(p.classroom.findMany.mock.calls.at(-1)[0].where.AND).toBeTruthy();
  });
});
