/**
 * E-Sınıf sınırlı yönetim — alt roller kendi alanında write yapabilir:
 * seviye sorumlusu → sınıf ekle; sınıf öğretmeni → öğrenci ata/Excel; zümre başkanı → üye ata.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    schoolLevel: { findFirst: jest.fn(), findMany: jest.fn() },
    classroom: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    department: { findFirst: jest.fn(), findMany: jest.fn() },
    branch: { findMany: jest.fn() },
    school: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { CreateClassroomUseCase, AssignStudentsToClassroomUseCase, AssignDepartmentMembersUseCase, ListClassroomsUseCase, GetDepartmentTreeUseCase, GetSchoolTreeUseCase } from '../../../src/application/use-cases/school/SchoolOrgUseCases';
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

describe('Sınıf listesi rol-kapsamlı (ödev atama bug fix)', () => {
  it('sınıf öğretmeni kendi sınıfını listeler (403 değil)', async () => {
    // resolveSchoolContext + resolveSchoolScope için mocklar
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);             // ctx (2 kez çağrılır)
    p.schoolUser.findUnique.mockResolvedValue({ userId: 'uT', departmentId: null });
    p.schoolLevel.findMany.mockResolvedValue([]);                     // seviye sorumlusu değil
    p.department.findMany.mockResolvedValue([]);                      // başkanlık/üyelik yok
    p.classroom.findMany
      .mockResolvedValueOnce([{ id: 'c1' }])                          // scope: sınıf öğretmeni olduğu sınıf
      .mockResolvedValueOnce([{ id: 'c1', name: '5-A', gradeLevel: 5, branchId: 'b1', _count: { students: 10 }, createdAt: new Date() }]); // asıl liste
    const r = await new ListClassroomsUseCase().execute({}, 'uT');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'c1', name: '5-A', studentCount: 10 });
  });

  it('hiçbir designation yoksa boş liste döner (sızıntı yok)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);
    p.schoolUser.findUnique.mockResolvedValue({ userId: 'uX', departmentId: null });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]); // adminUserId eşleşmesi yok → soloClassroom boş
    const r = await new ListClassroomsUseCase().execute({}, 'uX');
    expect(r).toEqual([]);
  });
});

describe('Zümre ağacı rol-kapsamlı (kimse yukarıyı görmez)', () => {
  const deptRow = (over: any) => ({ id: 'd1', name: 'Mat 5', subject: 'Matematik', levelId: 'lv5', branchId: 'b1', headUserId: null, headUser: null, _count: { members: 3 }, createdAt: new Date(), ...over });
  const branchRow = { id: 'b1', name: 'Şube', levels: [{ id: 'lv5', gradeLevel: 5 }, { id: 'lv6', gradeLevel: 6 }] };

  it('öğretmen yalnız üyesi olduğu zümreyi görür (kendi zümresi)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'suT', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'd1', classroomId: null });
    p.schoolLevel.findMany.mockResolvedValue([]);                 // seviye sorumlusu değil
    p.department.findMany.mockResolvedValueOnce([]);              // headed (başkanlık) yok
    p.department.findMany.mockResolvedValueOnce([deptRow({})]);   // ana sorgu (OR)
    p.branch.findMany.mockResolvedValue([branchRow]);
    const r = await new GetDepartmentTreeUseCase().execute('uT');
    // Ana sorgu yalnız kendi zümresini hedefler (yukarı yok)
    expect(p.department.findMany.mock.calls[1][0].where).toMatchObject({ OR: [{ id: { in: ['d1'] } }] });
    expect(r.schoolWide).toEqual([]);
    expect(r.branches).toHaveLength(1);
    expect(r.branches[0].levels).toHaveLength(1);
    expect(r.branches[0].levels[0].departments.map((d: any) => d.id)).toEqual(['d1']);
    expect(r.branches[0].departments).toEqual([]); // şube-geneli zümre görünmez
  });

  it('seviye sorumlusu yalnız seviyesinin zümrelerini görür (şube/okul-geneli HARİÇ)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'suL', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: null, classroomId: null });
    p.schoolLevel.findMany.mockResolvedValue([{ id: 'lv5' }]);    // lv5 sorumlusu
    p.department.findMany.mockResolvedValueOnce([]);              // headed yok
    p.department.findMany.mockResolvedValueOnce([deptRow({})]);   // ana sorgu → seviye zümresi
    p.branch.findMany.mockResolvedValue([branchRow]);
    const r = await new GetDepartmentTreeUseCase().execute('uL');
    expect(p.department.findMany.mock.calls[1][0].where).toMatchObject({ OR: [{ levelId: { in: ['lv5'] } }] });
    expect(r.schoolWide).toEqual([]);
    expect(r.branches[0].levels.map((l: any) => l.id)).toEqual(['lv5']); // lv6 görünmez
  });
});

describe('Şube/Sınıf ağacı rol-kapsamlı (kimse yukarıyı görmez)', () => {
  const treeBranch = {
    id: 'b1', name: 'Şube', adminUserId: null, adminUser: null,
    levels: [
      { id: 'lv5', gradeLevel: 5, adminUserId: 'uL', adminUser: null, classrooms: [{ id: 'c1', name: '5-A', gradeLevel: 5, adminUserId: null, adminUser: null, _count: { students: 10 } }] },
      { id: 'lv6', gradeLevel: 6, adminUserId: null, adminUser: null, classrooms: [{ id: 'c2', name: '6-A', gradeLevel: 6, adminUserId: null, adminUser: null, _count: { students: 8 } }] },
    ],
  };

  it('seviye sorumlusu yalnız kendi seviyesini görür (diğer seviyeler gizli)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'suL', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: null, classroomId: null });
    p.schoolLevel.findMany.mockResolvedValue([{ id: 'lv5', branchId: 'b1' }]); // lv5 sorumlusu
    p.classroom.findMany.mockResolvedValue([]);                                // sınıf öğretmeni değil
    p.branch.findMany.mockResolvedValue([treeBranch]);
    const r = await new GetSchoolTreeUseCase().execute('uL');
    expect(r).toHaveLength(1);
    expect(r[0].levels.map((l: any) => l.id)).toEqual(['lv5']); // lv6 yok
  });

  it('hiçbir designation yoksa ağaç boş (zümre üyeliği org ağacı açmaz)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ id: 'suX', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'd1', classroomId: null });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    const r = await new GetSchoolTreeUseCase().execute('uX');
    expect(r).toEqual([]);
  });
});
