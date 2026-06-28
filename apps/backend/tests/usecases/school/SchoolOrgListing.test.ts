/**
 * E-Sınıf SchoolOrg — liste/istatistik use-case'leri + sınıf yönetimi yetki/hata dalları.
 * (CreateLevel/Classroom vb. happy path'ler SchoolOrgUseCases.test.ts'te; burada
 *  kapsam dışı kalan use-case'ler ve auth/error branch'leri.)
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn(), count: jest.fn() },
    classroom: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
    schoolLevel: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
    department: { findFirst: jest.fn(), count: jest.fn() },
    branch: { count: jest.fn() },
    schoolSubject: { count: jest.fn() },
    schoolAssignment: { count: jest.fn() },
    schoolExam: { count: jest.fn() },
    liveSession: { count: jest.fn() },
    topic: { findMany: jest.fn() },
    school: { findUnique: jest.fn() },
  },
}));

import {
  RemoveStudentsFromClassroomUseCase,
  SetClassroomActiveUseCase,
  DeleteClassroomUseCase,
  DeleteLevelUseCase,
  AssignLevelAdminUseCase,
  AssignClassroomAdminUseCase,
  GetDepartmentMembersUseCase,
  ListSchoolLevelsUseCase,
  ListSchoolTopicsUseCase,
  ListSchoolPeriodsUseCase,
  GetSchoolPanelStatsUseCase,
} from '../../../src/application/use-cases/school/SchoolOrgUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const admin = { id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };
const teacher = { id: 'suT', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: 'b1', departmentId: 'd1', classroomId: null };

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(admin);
});

describe('RemoveStudentsFromClassroomUseCase', () => {
  it('sınıf yoksa → CLASSROOM_NOT_FOUND', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    await expect(new RemoveStudentsFromClassroomUseCase().execute('c1', { schoolUserIds: ['s1'] }, 'u0'))
      .rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });
  it('öğretmen kendi sınıfı değilse → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue(teacher);
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'bX', adminUserId: 'other', level: { adminUserId: 'other' } });
    await expect(new RemoveStudentsFromClassroomUseCase().execute('c1', { schoolUserIds: ['s1'] }, 'uT'))
      .rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
  it('öğrenci seçilmezse → NO_STUDENTS', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: null, level: { adminUserId: null } });
    await expect(new RemoveStudentsFromClassroomUseCase().execute('c1', { schoolUserIds: [] }, 'u0'))
      .rejects.toMatchObject({ code: 'NO_STUDENTS' });
  });
  it('başarı: yalnız bu sınıftaki öğrenciler çıkarılır → { removed }', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', adminUserId: null, level: { adminUserId: null } });
    p.schoolUser.updateMany.mockResolvedValue({ count: 2 });
    const r = await new RemoveStudentsFromClassroomUseCase().execute('c1', { schoolUserIds: ['s1', 's2', 's1'] }, 'u0');
    expect(r).toEqual({ removed: 2 });
    const where = p.schoolUser.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ classroomId: 'c1', schoolId: 'sch1', schoolRole: 'STUDENT' });
    expect(where.id.in).toEqual(['s1', 's2']); // dedupe
  });
});

describe('SetClassroomActiveUseCase', () => {
  it('sınıf yoksa → CLASSROOM_NOT_FOUND', async () => {
    p.classroom.findFirst.mockResolvedValue(null);
    await expect(new SetClassroomActiveUseCase().execute('c1', { isActive: false }, 'u0'))
      .rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });
  it('yetkisiz öğretmen → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue(teacher);
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'bX', level: { adminUserId: 'other' } });
    await expect(new SetClassroomActiveUseCase().execute('c1', { isActive: false }, 'uT'))
      .rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
  it('seviye sorumlusu kendi seviyesinin sınıfını pasife alabilir', async () => {
    p.schoolUser.findFirst.mockResolvedValue(teacher);
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'bX', level: { adminUserId: 'uT' } });
    p.classroom.update.mockResolvedValue({ id: 'c1', isActive: false });
    const r = await new SetClassroomActiveUseCase().execute('c1', { isActive: false }, 'uT');
    expect(r).toEqual({ id: 'c1', isActive: false });
  });
});

describe('DeleteClassroomUseCase', () => {
  it('öğrencisi varsa → CLASSROOM_NOT_EMPTY', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', level: { adminUserId: null }, _count: { students: 3 } });
    await expect(new DeleteClassroomUseCase().execute('c1', 'u0')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_EMPTY' });
  });
  it('boş sınıf silinir', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', level: { adminUserId: null }, _count: { students: 0 } });
    p.classroom.delete.mockResolvedValue({});
    const r = await new DeleteClassroomUseCase().execute('c1', 'u0');
    expect(r).toEqual({ ok: true });
  });
});

describe('DeleteLevelUseCase', () => {
  it('şube yöneticisi başka şube → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'BRANCH_ADMIN', branchId: 'b1' });
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b2', _count: { classrooms: 0 } });
    await expect(new DeleteLevelUseCase().execute('lv1', 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
  it('sınıfı olan seviye → LEVEL_NOT_EMPTY', async () => {
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1', _count: { classrooms: 2 } });
    await expect(new DeleteLevelUseCase().execute('lv1', 'u0')).rejects.toMatchObject({ code: 'LEVEL_NOT_EMPTY' });
  });
});

describe('AssignLevelAdminUseCase', () => {
  it('kullanıcı yoksa → USER_NOT_FOUND', async () => {
    p.schoolLevel.findFirst.mockResolvedValue({ id: 'lv1', branchId: 'b1' });
    p.schoolUser.findFirst.mockResolvedValueOnce(admin).mockResolvedValueOnce(null); // ctx sonra hedef kullanıcı
    await expect(new AssignLevelAdminUseCase().execute('lv1', { schoolUserId: 'sx' }, 'u0'))
      .rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});

describe('AssignClassroomAdminUseCase', () => {
  it('kullanıcı yoksa → USER_NOT_FOUND', async () => {
    p.classroom.findFirst.mockResolvedValue({ id: 'c1', branchId: 'b1', level: { adminUserId: null } });
    p.schoolUser.findFirst.mockResolvedValueOnce(admin).mockResolvedValueOnce(null);
    await expect(new AssignClassroomAdminUseCase().execute('c1', { schoolUserId: 'sx' }, 'u0'))
      .rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});

describe('GetDepartmentMembersUseCase', () => {
  it('yönetici/başkan değilse → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue(teacher);
    p.department.findFirst.mockResolvedValue({ id: 'd1', branchId: 'bX', headUserId: 'other' });
    await expect(new GetDepartmentMembersUseCase().execute('d1', 'uT'))
      .rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});

describe('ListSchoolLevelsUseCase', () => {
  it('seviyeleri tekilleştirip artan sıralar', async () => {
    p.schoolLevel.findMany.mockResolvedValue([{ gradeLevel: 6 }, { gradeLevel: 5 }, { gradeLevel: 6 }, { gradeLevel: 8 }]);
    const r = await new ListSchoolLevelsUseCase().execute('u0');
    expect(r).toEqual([{ gradeLevel: 5 }, { gradeLevel: 6 }, { gradeLevel: 8 }]);
  });
});

describe('ListSchoolTopicsUseCase', () => {
  it('aktif konuları döner', async () => {
    p.topic.findMany.mockResolvedValue([{ id: 't1', name: 'Cebir' }]);
    const r = await new ListSchoolTopicsUseCase().execute('u0');
    expect(r).toEqual([{ id: 't1', name: 'Cebir' }]);
    expect(p.topic.findMany.mock.calls[0][0].where).toMatchObject({ active: true });
  });
});

describe('ListSchoolPeriodsUseCase', () => {
  it('dönemler başlangıç tarihine göre azalan; güncel dönem işaretli', async () => {
    p.school.findUnique.mockResolvedValue({
      periodId: 'p-2026',
      periodLinks: [
        { period: { id: 'p-2025', name: '2025-2026', startDate: '2025-09-01' } },
        { period: { id: 'p-2026', name: '2026-2027', startDate: '2026-09-01' } },
      ],
    });
    const r = await new ListSchoolPeriodsUseCase().execute('u0');
    expect(r.currentPeriodId).toBe('p-2026');
    expect(r.periods.map((x: any) => x.id)).toEqual(['p-2026', 'p-2025']);
  });
  it('okul/dönem yoksa boş + null', async () => {
    p.school.findUnique.mockResolvedValue(null);
    const r = await new ListSchoolPeriodsUseCase().execute('u0');
    expect(r).toEqual({ currentPeriodId: null, periods: [] });
  });
});

describe('GetSchoolPanelStatsUseCase', () => {
  it('sayıları toplar; users = teachers + students', async () => {
    p.branch.count.mockResolvedValue(2);
    p.schoolLevel.count.mockResolvedValue(5);
    p.classroom.count.mockResolvedValue(10);
    p.department.count.mockResolvedValue(4);
    p.schoolSubject.count.mockResolvedValue(8);
    p.schoolUser.count.mockResolvedValueOnce(12).mockResolvedValueOnce(300); // teachers, students
    p.schoolAssignment.count.mockResolvedValue(20);
    p.schoolExam.count.mockResolvedValue(15);
    p.liveSession.count.mockResolvedValue(3);
    const r = await new GetSchoolPanelStatsUseCase().execute('u0');
    expect(r).toMatchObject({
      branches: 2, levels: 5, classrooms: 10, departments: 4, subjects: 8,
      teachers: 12, students: 300, users: 312, assignments: 20, exams: 15, liveSessions: 3,
    });
  });
});
