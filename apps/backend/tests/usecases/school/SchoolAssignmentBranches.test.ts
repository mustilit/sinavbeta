/**
 * E-Sınıf SchoolAssignment — branch (dal) kapsamı.
 * canManageExam owner, INVALID_DATE, classroomIds ?? [], showResultAfter/status dalları,
 * GetAssignOptions BRANCH_ADMIN/sınıf öğretmeni/__none__, List classroomId, Report istatistik
 * boş/dolu, Release/Close not-found+forbidden+ACTIVE.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn(async () => ({ userId: 'u1', departmentId: null })), count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    schoolExam: { findFirst: jest.fn() },
    schoolLevel: { findMany: jest.fn(async () => []) },
    schoolSubject: { findMany: jest.fn(async () => []) },
    department: { findMany: jest.fn(async () => []) },
    classroom: { findMany: jest.fn(async () => []) },
    school: { findUnique: jest.fn(async () => ({ periodId: null })) },
    schoolAssignment: { create: jest.fn(), findMany: jest.fn(async () => []), findFirst: jest.fn(), update: jest.fn(async () => ({})), count: jest.fn(async () => 0) },
    schoolSubmission: { findMany: jest.fn(async () => []) },
    schoolNotification: { create: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(async (ops: any) => Promise.all(ops)),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));

import {
  CreateAssignmentUseCase, GetAssignOptionsUseCase, ListAssignmentsUseCase,
  GetAssignmentReportUseCase, ReleaseAssignmentResultsUseCase, CloseAssignmentUseCase,
} from '../../../src/application/use-cases/school/SchoolAssignmentUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const teacher = { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'd1', classroomId: null };
const ctxOf = (over: any = {}) => ({ ...teacher, ...over });
const past = new Date(Date.now() - 1e7).toISOString();
const future = new Date(Date.now() + 1e7).toISOString();
const exam = (over: any = {}) => ({ id: 'ex1', title: 'Sınav', createdById: 'u1', departmentId: 'dX', poolVisibility: 'DEPARTMENT', questions: [{ id: 'q1' }], ...over });

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(ctxOf());
  p.schoolUser.findUnique.mockResolvedValue({ userId: 'u1', departmentId: null });
  p.schoolLevel.findMany.mockResolvedValue([]);
  p.classroom.findMany.mockResolvedValue([]);
  p.department.findMany.mockResolvedValue([]);
  p.school.findUnique.mockResolvedValue({ periodId: null });
});

describe('CreateAssignment — owner + tarih + status dalları', () => {
  it('sahibi (createdById) + showResultAfter geçerli + availableFrom geçmiş → ACTIVE', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam()); // dept dX ≠ d1, ama createdById u1 == actor
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]); // resolveSchoolScope (admin sınıfı) + validClassrooms
    p.schoolAssignment.create.mockResolvedValue({ id: 'a1' });
    const r = await new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: past, dueDate: future, showResultAfter: 'DUE_DATE' }, 'u1');
    expect(r.created).toBe(1);
    expect(p.schoolAssignment.create.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', showResultAfter: 'DUE_DATE' });
  });
  it('geçersiz tarih → INVALID_DATE', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam());
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: 'xx', dueDate: 'yy' }, 'u1')).rejects.toMatchObject({ code: 'INVALID_DATE' });
  });
  it('classroomIds undefined → NO_CLASSROOM (?? [])', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam());
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', availableFrom: past, dueDate: future } as any, 'u1')).rejects.toMatchObject({ code: 'NO_CLASSROOM' });
  });
});

describe('GetAssignOptions — BRANCH_ADMIN / sınıf öğretmeni / kapsamsız', () => {
  it('BRANCH_ADMIN → şube + tüm dersler', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1', departmentId: null }));
    p.schoolLevel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ gradeLevel: 5 }]); // myLevels(adminUserId)=[]; final levels
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    p.schoolSubject.findMany.mockResolvedValue([{ name: 'Mat' }]);
    const r = await new GetAssignOptionsUseCase().execute('u0');
    expect(r.levels).toEqual([{ gradeLevel: 5 }]);
    expect(r.subjects).toEqual([{ name: 'Mat' }]);
  });
  it('sınıf öğretmeni (myClasses → levelIds)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolLevel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ gradeLevel: 6 }]); // myLevels=[]; final
    p.classroom.findMany.mockResolvedValue([{ levelId: 'lv6' }]); // myClasses → levelIds
    p.department.findMany.mockResolvedValue([]);
    p.schoolSubject.findMany.mockResolvedValue([{ name: 'Fen' }]);
    const r = await new GetAssignOptionsUseCase().execute('u0');
    expect(r.levels).toEqual([{ gradeLevel: 6 }]);
  });
  it('seviye sorumlusu (myLevels → levelIds)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolLevel.findMany.mockResolvedValueOnce([{ id: 'lv5' }]).mockResolvedValueOnce([{ gradeLevel: 5 }]); // myLevels dolu → 116 true
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    p.schoolSubject.findMany.mockResolvedValue([{ name: 'Mat' }]);
    const r = await new GetAssignOptionsUseCase().execute('u0');
    expect(r.levels).toEqual([{ gradeLevel: 5 }]);
  });
  it('kapsamsız öğretmen → levelWhere __none__', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'TEACHER', departmentId: null }));
    p.schoolLevel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // myLevels=[]; final levels (where __none__)
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    p.schoolSubject.findMany.mockResolvedValue([]);
    const r = await new GetAssignOptionsUseCase().execute('u0');
    expect(r.levels).toEqual([]);
    expect(p.schoolLevel.findMany.mock.calls[1][0].where).toEqual({ id: '__none__' });
  });
});

describe('ListAssignments — classroomId filtresi', () => {
  it('admin + classroomId → where.classroomId', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'SCHOOL_ADMIN', departmentId: null }));
    p.schoolAssignment.findMany.mockResolvedValue([]);
    await new ListAssignmentsUseCase().execute({ classroomId: 'c1' }, 'u0');
    expect(p.schoolAssignment.findMany.mock.calls[0][0].where.classroomId).toBe('c1');
  });
});

describe('GetAssignmentReport — istatistik boş vs dolu', () => {
  it('not-found', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new GetAssignmentReportUseCase().execute('aX', 'u0')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });
  it('teslim/skor yok + totalStudents 0 → avg/max/min null, rate 0', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({
      id: 'a1', title: 'Ö', status: 'ACTIVE', availableFrom: new Date(Date.now() - 1e7), dueDate: new Date(Date.now() + 1e7),
      showResultAfter: 'SUBMIT', resultsReleased: false,
      exam: { title: 'S', examType: 'WRITTEN', totalPoints: 10 }, classroom: { id: 'c1', name: '5-A' },
      submissions: [],
    });
    p.schoolUser.count.mockResolvedValue(0);
    const r = await new GetAssignmentReportUseCase().execute('a1', 'u0');
    expect(r.stats).toMatchObject({ totalStudents: 0, submissionRate: 0, avgScore: null, maxScore: null, minScore: null });
  });
  it('skorlu teslim + öğrenci sayısı → avg/max/min + rate', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({
      id: 'a1', title: 'Ö', status: 'ACTIVE', availableFrom: new Date(Date.now() - 1e7), dueDate: new Date(Date.now() + 1e7),
      showResultAfter: 'SUBMIT', resultsReleased: false,
      exam: { title: 'S', examType: 'TEST', totalPoints: 10 }, classroom: { id: 'c1', name: '5-A' },
      submissions: [
        { id: 's1', status: 'GRADED', totalScore: 8, maxScore: 10, submittedAt: new Date(), student: { username: 'S1', firstName: 'A', lastName: 'B' } },
        { id: 's2', status: 'GRADED', totalScore: 4, maxScore: 10, submittedAt: new Date(), student: { username: 'S2', firstName: null, lastName: null } },
      ],
    });
    p.schoolUser.count.mockResolvedValue(4);
    const r = await new GetAssignmentReportUseCase().execute('a1', 'u0');
    expect(r.stats).toMatchObject({ totalStudents: 4, submittedCount: 2, submissionRate: 50, avgScore: 6, maxScore: 8, minScore: 4 });
    expect(r.submissions[1].studentName).toBeNull();
  });
});

describe('Release/Close — not-found + forbidden + ACTIVE', () => {
  it('Release: not-found', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new ReleaseAssignmentResultsUseCase().execute('aX', 'u0')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });
  it('Close: not-found', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new CloseAssignmentUseCase().execute('aX', { status: 'CLOSED' }, 'u0')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });
  it('Close: başkasının ödevi + öğretmen → FORBIDDEN', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', createdById: 'other' });
    await expect(new CloseAssignmentUseCase().execute('a1', { status: 'CLOSED' }, 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('Close: ACTIVE durumuna alma (status ternary)', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', createdById: 'u1' });
    const r = await new CloseAssignmentUseCase().execute('a1', { status: 'ACTIVE' }, 'u1');
    expect(r).toEqual({ id: 'a1', status: 'ACTIVE' });
  });
  it('Release: zümre başkanı başkasının ödevini yayımlar', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'DEPT_HEAD' }));
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', createdById: 'other' });
    const r = await new ReleaseAssignmentResultsUseCase().execute('a1', 'u1');
    expect(r).toEqual({ ok: true });
  });
});
