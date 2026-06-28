/**
 * E-Sınıf ödev atama — sınav doğrulama/görünürlük, tarih, çoklu sınıf + effectiveStatus.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn(), findUnique: jest.fn(async () => ({ userId: 'u1', departmentId: null })), count: jest.fn() },
    schoolExam: { findFirst: jest.fn() },
    schoolLevel: { findMany: jest.fn(async () => []) },
    schoolSubject: { findMany: jest.fn(async () => []) },
    department: { findMany: jest.fn(async () => []) },
    classroom: { findMany: jest.fn(async () => []) },
    school: { findUnique: jest.fn(async () => ({ periodId: null })) },
    schoolAssignment: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../../../src/common/tenant', () => ({ getDefaultTenantId: () => 'ten1' }));

import {
  CreateAssignmentUseCase, effectiveStatus,
  ListAssignmentsUseCase, GetAssignOptionsUseCase, GetAssignmentReportUseCase, ReleaseAssignmentResultsUseCase, CloseAssignmentUseCase,
} from '../../../src/application/use-cases/school/SchoolAssignmentUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const teacher = { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'd1', classroomId: null };
const tomorrow = new Date(Date.now() + 86400000).toISOString();
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();

function exam(over = {}) {
  return { id: 'ex1', title: 'Sınav', createdById: 'u1', departmentId: 'd1', poolVisibility: 'DEPARTMENT', questions: [{ id: 'q1' }], ...over };
}

describe('CreateAssignmentUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(teacher);
    p.schoolExam.findFirst.mockResolvedValue(exam());
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    p.schoolAssignment.create.mockImplementation(async ({ data }: any) => ({ id: `a-${data.classroomId}` }));
    p.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
  });

  it('sınav bulunamaz/arşivli → EXAM_NOT_FOUND', async () => {
    p.schoolExam.findFirst.mockResolvedValue(null);
    await expect(new CreateAssignmentUseCase().execute({ examId: 'x', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
  it('başka zümrenin DEPARTMENT sınavı → FORBIDDEN', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam({ departmentId: 'dX', createdById: 'other', poolVisibility: 'DEPARTMENT' }));
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('SCHOOL görünür sınav başka zümreden de atanabilir', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam({ departmentId: 'dX', createdById: 'other', poolVisibility: 'SCHOOL' }));
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]);
    const r = await new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1');
    expect(r.created).toBe(1);
  });
  it('sorusuz sınav → EXAM_EMPTY', async () => {
    p.schoolExam.findFirst.mockResolvedValue(exam({ questions: [] }));
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'EXAM_EMPTY' });
  });
  it('son tarih başlangıçtan önce → INVALID_RANGE', async () => {
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: nextWeek, dueDate: tomorrow }, 'u1')).rejects.toMatchObject({ code: 'INVALID_RANGE' });
  });
  it('sınıf seçilmezse → NO_CLASSROOM', async () => {
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: [], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'NO_CLASSROOM' });
  });
  it('başarı: çoklu sınıf → sınıf başına bir ödev', async () => {
    const r = await new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1', 'c2'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1');
    expect(r.created).toBe(2);
    expect(r.assignmentIds).toHaveLength(2);
  });
  it('okul yöneticisi başka zümrenin DEPARTMENT sınavını atayabilir (manager bypass)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'SCHOOL_ADMIN', departmentId: null });
    p.schoolExam.findFirst.mockResolvedValue(exam({ departmentId: 'dX', createdById: 'other', poolVisibility: 'DEPARTMENT' }));
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]);
    const r = await new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'ua');
    expect(r.created).toBe(1);
  });
  it('kapsam dışı sınıf → CLASSROOM_NOT_FOUND', async () => {
    p.classroom.findMany.mockResolvedValue([]); // kapsam + geçerli sorgu boş
    await expect(new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['cX'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });
  it('oluşturma: ödev okulun güncel dönemine damgalanır', async () => {
    p.school.findUnique.mockResolvedValue({ periodId: 'p-2026' });
    let createdData;
    p.schoolAssignment.create.mockImplementation(async ({ data }) => { createdData = data; return { id: 'a1' }; });
    await new CreateAssignmentUseCase().execute({ examId: 'ex1', classroomIds: ['c1'], availableFrom: tomorrow, dueDate: nextWeek }, 'u1');
    expect(createdData.periodId).toBe('p-2026');
  });
});

describe('effectiveStatus', () => {
  it('availableFrom gelmediyse SCHEDULED', () => {
    expect(effectiveStatus({ status: 'SCHEDULED', availableFrom: new Date(Date.now() + 1e6), dueDate: new Date(Date.now() + 2e6) })).toBe('SCHEDULED');
  });
  it('aralıktaysa ACTIVE', () => {
    expect(effectiveStatus({ status: 'SCHEDULED', availableFrom: new Date(Date.now() - 1e6), dueDate: new Date(Date.now() + 1e6) })).toBe('ACTIVE');
  });
  it('CLOSED kalır', () => {
    expect(effectiveStatus({ status: 'CLOSED', availableFrom: new Date(Date.now() - 1e6), dueDate: new Date(Date.now() + 1e6) })).toBe('CLOSED');
  });
});

describe('ListAssignmentsUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(teacher);
    // clearAllMocks mockResolvedValue impl'lerini sıfırlamaz → önceki describe'lerden sızıntıyı temizle
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    p.school.findUnique.mockResolvedValue({ periodId: null });
  });
  it('öğretmen yalnız kendi ödevleri (createdById filtresi)', async () => {
    p.schoolAssignment.findMany.mockResolvedValue([
      { id: 'a1', title: 'Ödev', availableFrom: new Date(Date.now() - 1e6), dueDate: new Date(Date.now() + 1e6), status: 'SCHEDULED', showResultAfter: 'SUBMIT', resultsReleased: false, createdAt: new Date(), exam: { title: 'S', examType: 'TEST' }, classroom: { name: '5-A' }, _count: { submissions: 3 } },
    ]);
    const r = await new ListAssignmentsUseCase().execute({}, 'u1');
    expect(r[0]).toMatchObject({ id: 'a1', examType: 'TEST', classroomName: '5-A', submissionCount: 3, status: 'ACTIVE' });
    // Designation yok → yalnız kendi attığı (OR sadece createdById)
    expect(p.schoolAssignment.findMany.mock.calls[0][0].where.AND[0].OR).toEqual([{ createdById: 'u1' }]);
  });
  it('okul yöneticisi: tüm okul ödevlerini görür (kapsam filtresi YOK)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'SCHOOL_ADMIN' });
    p.schoolAssignment.findMany.mockResolvedValue([]);
    await new ListAssignmentsUseCase().execute({}, 'ua');
    const where = p.schoolAssignment.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('AND');
    expect(where).not.toHaveProperty('createdById');
  });
  it('şube yöneticisi: kendi şubesinin ödevleri + kendi attığı', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'BRANCH_ADMIN', branchId: 'b1', departmentId: null });
    p.schoolAssignment.findMany.mockResolvedValue([]);
    await new ListAssignmentsUseCase().execute({}, 'ub');
    const or = p.schoolAssignment.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(or).toEqual(expect.arrayContaining([{ createdById: 'ub' }, { classroom: { branchId: 'b1' } }]));
  });
  it('sınıf öğretmeni: yalnız kendi sınıf(lar)ının ödevleri + kendi attığı', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, departmentId: null });
    p.classroom.findMany.mockResolvedValue([{ id: 'c1' }]); // adminUserId == kendisi
    p.schoolAssignment.findMany.mockResolvedValue([]);
    await new ListAssignmentsUseCase().execute({}, 'u1');
    const or = p.schoolAssignment.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(or).toEqual(expect.arrayContaining([{ createdById: 'u1' }, { classroom: { id: { in: ['c1'] } } }]));
  });
  it('dönemsel: periodId verilmezse okulun güncel dönemi süzülür', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'SCHOOL_ADMIN' });
    p.school.findUnique.mockResolvedValue({ periodId: 'p-cur' });
    p.schoolAssignment.findMany.mockResolvedValue([]);
    await new ListAssignmentsUseCase().execute({}, 'ua');
    expect(p.schoolAssignment.findMany.mock.calls[0][0].where.periodId).toBe('p-cur');
  });
  it('dönemsel: eski dönem (periodId) filtre olarak geçer', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'SCHOOL_ADMIN' });
    p.school.findUnique.mockResolvedValue({ periodId: 'p-cur' });
    p.schoolAssignment.findMany.mockResolvedValue([]);
    await new ListAssignmentsUseCase().execute({ periodId: 'p-old' }, 'ua');
    expect(p.schoolAssignment.findMany.mock.calls[0][0].where.periodId).toBe('p-old');
  });
  it('zümre başkanı: branş-kısıtlı kapsam (subjectSpan + exam.departmentId) + kendi attığı', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'DEPT_HEAD', departmentId: 'd1' });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    // resolveReportScope: headed [] → ctx.departmentId d1; sonra d1 detayı (levelId span)
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'd1', levelId: 'lv7', branchId: 'b1' }]);
    p.schoolAssignment.findMany.mockResolvedValue([]);
    await new ListAssignmentsUseCase().execute({}, 'uHead');
    const or = p.schoolAssignment.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(or).toEqual(expect.arrayContaining([{ createdById: 'uHead' }]));
    expect(or.some((c: any) => c.AND && JSON.stringify(c.AND).includes('departmentId'))).toBe(true);
  });
});

describe('GetAssignOptionsUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('okul yöneticisi: tüm seviye + tüm ders', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'SCHOOL_ADMIN', departmentId: null });
    p.schoolLevel.findMany.mockResolvedValue([{ gradeLevel: 5 }, { gradeLevel: 6 }, { gradeLevel: 5 }]);
    p.schoolSubject.findMany.mockResolvedValue([{ name: 'Matematik' }, { name: 'Fen' }]);
    const r = await new GetAssignOptionsUseCase().execute('ua');
    expect(r.levels).toEqual([{ gradeLevel: 5 }, { gradeLevel: 6 }]);
    expect(r.subjects).toEqual([{ name: 'Matematik' }, { name: 'Fen' }]);
  });
  it('zümre başkanı: zümre seviyesi + yalnız kendi dersi', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'DEPT_HEAD', departmentId: 'd1' });
    p.schoolLevel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ gradeLevel: 7 }]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ subject: 'Matematik', levelId: 'lv7', branchId: 'b1' }]);
    const r = await new GetAssignOptionsUseCase().execute('ud');
    expect(r.levels).toEqual([{ gradeLevel: 7 }]);
    expect(r.subjects).toEqual([{ name: 'Matematik' }]);
    expect(p.schoolSubject.findMany).not.toHaveBeenCalled(); // ders havuzuna gitmez (kendi dersi)
  });
  it('zümre başkanı: şube-geneli zümre (levelId yok) → şube seviyelerine kapsanır', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'DEPT_HEAD', departmentId: 'd1' });
    p.schoolLevel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ gradeLevel: 9 }]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ subject: 'Fizik', levelId: null, branchId: 'b1' }]);
    const r = await new GetAssignOptionsUseCase().execute('ud');
    expect(r.levels).toEqual([{ gradeLevel: 9 }]);
    // levelWhere şube üzerinden kurulur
    const finalLevelWhere = p.schoolLevel.findMany.mock.calls[1][0].where;
    expect(JSON.stringify(finalLevelWhere)).toContain('branchId');
  });
  it('zümre başkanı: okul-geneli zümre (levelId+branchId yok) → tüm seviyeler', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'DEPT_HEAD', departmentId: 'd1' });
    p.schoolLevel.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ gradeLevel: 5 }, { gradeLevel: 6 }]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ subject: 'Rehberlik', levelId: null, branchId: null }]);
    const r = await new GetAssignOptionsUseCase().execute('ud');
    expect(r.levels).toEqual([{ gradeLevel: 5 }, { gradeLevel: 6 }]);
    // okul-geneli → levelWhere { schoolId } (OR yok)
    expect(p.schoolLevel.findMany.mock.calls[1][0].where).toEqual({ schoolId: 'sch1' });
  });
});

describe('GetAssignmentReportUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(teacher); });
  it('ödev yoksa ASSIGNMENT_NOT_FOUND', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new GetAssignmentReportUseCase().execute('x', 'u1')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });
  it('istatistik + teslim listesi', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({
      id: 'a1', title: 'Ödev', availableFrom: new Date(Date.now() - 1e6), dueDate: new Date(Date.now() + 1e6), status: 'ACTIVE', showResultAfter: 'SUBMIT', resultsReleased: false,
      exam: { title: 'S', examType: 'TEST', totalPoints: 10 }, classroom: { name: '5-A', id: 'c1' },
      submissions: [
        { id: 's1', status: 'GRADED', totalScore: 8, maxScore: 10, submittedAt: new Date(), student: { username: 'ALEF-S-0001', firstName: 'Ali', lastName: 'V' } },
        { id: 's2', status: 'IN_PROGRESS', totalScore: null, maxScore: null, submittedAt: null, student: { username: 'ALEF-S-0002', firstName: null, lastName: null } },
      ],
    });
    p.schoolUser.count.mockResolvedValue(4);
    const r = await new GetAssignmentReportUseCase().execute('a1', 'u1');
    expect(r.stats).toMatchObject({ totalStudents: 4, submittedCount: 1, submissionRate: 25, avgScore: 8, maxScore: 8, minScore: 8 });
    expect(r.submissions).toHaveLength(2);
  });
});

describe('ReleaseAssignmentResultsUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(teacher); });
  it('başkasının ödevi + öğretmen → FORBIDDEN', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', createdById: 'other' });
    await expect(new ReleaseAssignmentResultsUseCase().execute('a1', 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('kendi ödevi → yayımlanır', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', createdById: 'u1' });
    p.schoolAssignment.update.mockResolvedValue({});
    const r = await new ReleaseAssignmentResultsUseCase().execute('a1', 'u1');
    expect(r).toEqual({ ok: true });
  });
});

describe('CloseAssignmentUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(teacher); });
  it('kapatma/açma', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', createdById: 'u1' });
    p.schoolAssignment.update.mockResolvedValue({});
    const r = await new CloseAssignmentUseCase().execute('a1', { status: 'CLOSED' }, 'u1');
    expect(r).toEqual({ id: 'a1', status: 'CLOSED' });
  });
});
