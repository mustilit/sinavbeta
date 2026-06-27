/**
 * E-Sınıf Raporlama use-case'leri — overview / şube / filtreli kırılım / sınıf detayı.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn() },
    schoolLevel: { findMany: jest.fn() },
    classroom: { findMany: jest.fn() },
    department: { findMany: jest.fn() },
  },
}));
jest.mock('../../../src/infrastructure/database/dbRouter', () => ({ prismaRead: jest.fn() }));

import {
  GetSchoolReportUseCase,
  GetBranchReportUseCase,
  GetFilteredReportUseCase,
  GetClassroomReportUseCase,
} from '../../../src/application/use-cases/school/SchoolReportUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { prismaRead } from '../../../src/infrastructure/database/dbRouter';

const p = prisma as any;
const read = prismaRead as jest.Mock;
const admin = { id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(admin);
  // resolveSchoolScope yardımcıları (prisma; prismaRead'den ayrı)
  p.schoolUser.findUnique.mockResolvedValue({ userId: 'u0', departmentId: null });
  p.schoolLevel.findMany.mockResolvedValue([]);
  p.classroom.findMany.mockResolvedValue([]);
  p.department.findMany.mockResolvedValue([]);
});

describe('GetSchoolReportUseCase (overview)', () => {
  it('SCHOOL_ADMIN değilse FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'BRANCH_ADMIN' });
    read.mockReturnValue({});
    await expect(new GetSchoolReportUseCase().execute('u0')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
  it('şube + zümre + genel ortalama hesaplanır', async () => {
    read.mockReturnValue({
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', name: 'B1' }]) },
      department: { findMany: jest.fn().mockResolvedValue([{ id: 'd1', name: 'Mat', _count: { exams: 2 } }]) },
      classroom: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', branchId: 'b1' }]) },
      schoolUser: { groupBy: jest.fn().mockResolvedValue([{ branchId: 'b1', _count: { _all: 10 } }]) },
      schoolAssignment: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', classroomId: 'c1', exam: { departmentId: 'd1' } }]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([{ totalScore: 8, maxScore: 10, assignment: { classroomId: 'c1', exam: { departmentId: 'd1' } } }]) },
    });
    const r = await new GetSchoolReportUseCase().execute('u0');
    expect(r.overall).toMatchObject({ branchCount: 1, departmentCount: 1, classroomCount: 1, assignmentCount: 1, submissionCount: 1, avgPercent: 80 });
    expect(r.branches[0]).toMatchObject({ id: 'b1', studentCount: 10, classroomCount: 1, avgPercent: 80 });
    expect(r.departments[0]).toMatchObject({ id: 'd1', examCount: 2, assignmentCount: 1, avgPercent: 80 });
  });
});

describe('GetBranchReportUseCase', () => {
  it('şube yoksa BRANCH_NOT_FOUND', async () => {
    read.mockReturnValue({ branch: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(new GetBranchReportUseCase().execute('bx', 'u0')).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
  });
  it('şube yöneticisi başka şubeyi göremez → FORBIDDEN', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'BRANCH_ADMIN', branchId: 'b1' });
    read.mockReturnValue({});
    await expect(new GetBranchReportUseCase().execute('b2', 'u0')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('sınıf performansı döner', async () => {
    read.mockReturnValue({
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', name: 'B1' }) },
      classroom: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: '5-A', gradeLevel: 5, _count: { students: 3 } }]) },
      schoolAssignment: { groupBy: jest.fn().mockResolvedValue([{ classroomId: 'c1', _count: { _all: 2 } }]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([{ totalScore: 9, maxScore: 10, assignment: { classroomId: 'c1' } }]) },
    });
    const r = await new GetBranchReportUseCase().execute('b1', 'u0');
    expect(r.branchName).toBe('B1');
    expect(r.classrooms[0]).toMatchObject({ name: '5-A', studentCount: 3, assignmentCount: 2, submissionCount: 1, avgPercent: 90 });
  });
});

describe('GetFilteredReportUseCase', () => {
  it('şube/seviye/sınıf kırılımı + konu + takvim + highlights', async () => {
    read.mockReturnValue({
      classroom: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: '5-A', gradeLevel: 5, branchId: 'b1', _count: { students: 3 } }]) },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', name: 'B1' }]) },
      schoolAssignment: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', classroomId: 'c1' }]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([
        { totalScore: 8, maxScore: 10, submittedAt: new Date('2026-06-01T10:00:00Z'), assignment: { classroomId: 'c1', exam: { department: { name: 'Mat' } } } },
      ]) },
    });
    const r = await new GetFilteredReportUseCase().execute({}, 'u0');
    expect(r.branches[0]).toMatchObject({ id: 'b1', avgPercent: 80, classroomCount: 1, studentCount: 3 });
    expect(r.levels[0]).toMatchObject({ gradeLevel: 5, avgPercent: 80 });
    expect(r.classrooms[0]).toMatchObject({ id: 'c1', avgPercent: 80, assignmentCount: 1 });
    expect(r.byDepartment[0]).toMatchObject({ name: 'Mat', avgPercent: 80 });
    expect(r.timeseries).toHaveLength(1);
    expect(r.highlights.bestBranch).toMatchObject({ id: 'b1' });
    expect(r.highlights.bestClassByLevel[0].classroom).toMatchObject({ id: 'c1' });
  });
  it('şube yöneticisi yalnız kendi şubesi (kapsam OR)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'BRANCH_ADMIN', branchId: 'b1' });
    const classroomFindMany = jest.fn().mockResolvedValue([]);
    read.mockReturnValue({
      classroom: { findMany: classroomFindMany },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      schoolAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    });
    await new GetFilteredReportUseCase().execute({}, 'u0');
    const where = classroomFindMany.mock.calls[0][0].where;
    // Designation tabanlı rapor kapsamı: şube yöneticisi → tüm-ders erişimi {branchId}
    expect(where.OR).toEqual(expect.arrayContaining([{ branchId: 'b1' }]));
  });

  it('düz zümre üyesi (başkan değil) rapor göremez — hiyerarşide yukarı yok', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'TEACHER', branchId: null, departmentId: 'd1' });
    // p defaults: schoolLevel/classroom/department.findMany → [] (level head/class teacher/dept head DEĞİL)
    const r = await new GetFilteredReportUseCase().execute({}, 'uMember');
    expect(r.classrooms).toEqual([]);
    expect(r.branches).toEqual([]);
  });

  it('sınıf öğretmeni yalnız kendi sınıfını görür (id OR)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'TEACHER', branchId: null, departmentId: null });
    p.classroom.findMany.mockResolvedValue([{ id: 'c9' }]); // adminUserId eşleşmesi → sınıf öğretmeni
    const classroomFindMany = jest.fn().mockResolvedValue([]);
    read.mockReturnValue({
      classroom: { findMany: classroomFindMany },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      schoolAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    });
    await new GetFilteredReportUseCase().execute({}, 'uClassTeacher');
    const where = classroomFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([{ id: { in: ['c9'] } }]));
  });
});

describe('GetClassroomReportUseCase', () => {
  it('sınıf yoksa CLASSROOM_NOT_FOUND', async () => {
    read.mockReturnValue({ classroom: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(new GetClassroomReportUseCase().execute('cx', {}, 'u0')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });
  it('öğrenci/ödev/zümre kırılımı döner', async () => {
    read.mockReturnValue({
      classroom: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', name: '5-A', gradeLevel: 5, branch: { name: 'B1' }, _count: { students: 2 } }) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([
        { totalScore: 8, maxScore: 10, student: { id: 's1', username: 'ALEF-S-0001', firstName: 'Ali', lastName: 'V' }, assignment: { id: 'a1', title: 'Ödev1', exam: { department: { name: 'Mat' } } } },
        { totalScore: 6, maxScore: 10, student: { id: 's2', username: 'ALEF-S-0002', firstName: null, lastName: null }, assignment: { id: 'a1', title: 'Ödev1', exam: { department: { name: 'Mat' } } } },
      ]) },
    });
    const r = await new GetClassroomReportUseCase().execute('c1', {}, 'u0');
    expect(r.classroom).toMatchObject({ name: '5-A', branchName: 'B1', studentCount: 2 });
    expect(r.summary).toMatchObject({ submissionCount: 2, avgPercent: 70 });
    expect(r.students).toHaveLength(2);
    expect(r.assignments[0]).toMatchObject({ title: 'Ödev1', submissionCount: 2, avgPercent: 70 });
    expect(r.departments[0]).toMatchObject({ name: 'Mat', submissionCount: 2, avgPercent: 70 });
  });
});
