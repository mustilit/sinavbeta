/**
 * E-Sınıf Raporlama — branch (dal) kapsamı için kenar-veri testleri.
 * Null skor / null zümre adı / null submittedAt / boş şube / bilinmeyen sınıf /
 * tüm-ders + branş-span birleşik kapsam / tarih aralığı tek-uç gibi dalları sürer.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolLevel: { findMany: jest.fn(async () => []) },
    classroom: { findMany: jest.fn(async () => []) },
    department: { findMany: jest.fn(async () => []) },
    school: { findUnique: jest.fn(async () => ({ periodId: null })) },
  },
}));
jest.mock('../../../src/infrastructure/database/dbRouter', () => ({ prismaRead: jest.fn() }));

import {
  GetSchoolReportUseCase,
  GetFilteredReportUseCase,
  GetClassroomReportUseCase,
  GetBranchReportUseCase,
} from '../../../src/application/use-cases/school/SchoolReportUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { prismaRead } from '../../../src/infrastructure/database/dbRouter';

const p = prisma as any;
const read = prismaRead as jest.Mock;
const admin = { id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null };

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(admin);
  p.schoolLevel.findMany.mockResolvedValue([]);
  p.classroom.findMany.mockResolvedValue([]);
  p.department.findMany.mockResolvedValue([]);
  p.school.findUnique.mockResolvedValue({ periodId: null });
});

describe('GetSchoolReportUseCase — kenar dalları', () => {
  it('null skor / bilinmeyen şube sınıfı / null zümre / branchId-null öğrenci / boş şube fallback', async () => {
    read.mockReturnValue({
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', name: 'B1' }, { id: 'b2', name: 'B2 (boş)' }]) },
      department: { findMany: jest.fn().mockResolvedValue([{ id: 'd1', name: 'Mat', _count: { exams: 1 } }, { id: 'd2', name: 'Fen (boş)', _count: { exams: 0 } }]) }, // d2: ödev/teslim yok → ?? 0 / ?? []
      classroom: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', branchId: 'b1' }]) },
      schoolUser: { groupBy: jest.fn().mockResolvedValue([{ branchId: 'b1', _count: { _all: 5 } }, { branchId: null, _count: { _all: 2 } }]) },
      schoolAssignment: { findMany: jest.fn().mockResolvedValue([
        { id: 'a1', classroomId: 'c1', exam: { departmentId: 'd1' } },
        { id: 'a2', classroomId: 'cX', exam: { departmentId: 'd1' } }, // bilinmeyen sınıf → branş yok
        { id: 'a3', classroomId: 'c1', exam: { departmentId: null } }, // zümresiz
      ]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([
        { totalScore: 8, maxScore: 10, assignment: { classroomId: 'c1', exam: { departmentId: 'd1' } } },
        { totalScore: null, maxScore: 10, assignment: { classroomId: 'c1', exam: { departmentId: 'd1' } } }, // null skor → atla
        { totalScore: 5, maxScore: 0, assignment: { classroomId: 'cX', exam: { departmentId: 'd1' } } },        // max 0 → pct null
        { totalScore: 6, maxScore: 10, assignment: { classroomId: 'cX', exam: { departmentId: 'd1' } } },        // bilinmeyen şube
        { totalScore: 7, maxScore: 10, assignment: { classroomId: 'c1', exam: { departmentId: null } } },        // zümresiz
      ]) },
    });
    const r = await new GetSchoolReportUseCase().execute('u0');
    expect(r.overall.branchCount).toBe(2);
    const b2 = r.branches.find((x: any) => x.id === 'b2');
    expect(b2).toMatchObject({ classroomCount: 0, studentCount: 0, assignmentCount: 0, avgPercent: null });
    expect(r.branches.find((x: any) => x.id === 'b1')!.avgPercent).not.toBeNull();
  });
});

describe('GetFilteredReportUseCase — kenar dalları', () => {
  it('admin + grade/classroom/tarih filtreleri + null skor + zümresiz + null submittedAt + branchName fallback', async () => {
    p.schoolUser.findFirst.mockResolvedValue(admin);
    read.mockReturnValue({
      classroom: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'c1' }])                                                              // allClassIds (admin)
          .mockResolvedValueOnce([{ id: 'c1', name: '5-A', gradeLevel: 5, branchId: 'bZ', _count: { students: 3 } }]), // union detayları
      },
      branch: { findMany: jest.fn().mockResolvedValue([]) }, // branchName map boş → '—'
      schoolAssignment: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', classroomId: 'c1' }]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([
        { totalScore: 9, maxScore: 10, submittedAt: new Date('2026-03-01T08:00:00Z'), assignment: { classroomId: 'c1', exam: { department: { name: 'Mat' } } } },
        { totalScore: null, maxScore: 10, submittedAt: new Date('2026-03-02T08:00:00Z'), assignment: { classroomId: 'c1', exam: { department: { name: 'Mat' } } } }, // null skor
        { totalScore: 4, maxScore: 10, submittedAt: null, assignment: { classroomId: 'c1', exam: { department: null } } }, // zümresiz + null gün
      ]) },
    });
    const r = await new GetFilteredReportUseCase().execute({ gradeLevel: 5, classroomId: 'c1', from: '2026-01-01', to: '2026-06-01' }, 'u0');
    expect(r.classrooms[0]).toMatchObject({ id: 'c1', branchName: '—' });
    expect(r.byDepartment.map((d: any) => d.name)).toEqual(expect.arrayContaining(['Mat', 'Zümresiz']));
  });

  it('hiç erişilebilir sınıf yoksa boş rapor (unionIds boş)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(admin);
    read.mockReturnValue({ classroom: { findMany: jest.fn().mockResolvedValue([]) } });
    const r = await new GetFilteredReportUseCase().execute({}, 'u0');
    expect(r).toMatchObject({ branches: [], levels: [], classrooms: [] });
  });

  it('boş kapsam (rs.empty) → boş rapor', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'TEACHER', departmentId: null });
    const r = await new GetFilteredReportUseCase().execute({}, 'uMember');
    expect(r.branches).toEqual([]);
  });

  it('birleşik kapsam: seviye sorumlusu + zümre başkanı (allSubjectWhere + subjectSpan + subjOnly)', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'TEACHER', branchId: null, departmentId: null });
    p.schoolLevel.findMany.mockResolvedValue([{ id: 'lv5' }]);              // seviye sorumlusu → allSubjectWhere
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([{ id: 'd1' }]).mockResolvedValueOnce([{ id: 'd1', levelId: 'lv7', branchId: 'b1' }]); // zümre başkanı → subjectSpan
    const classroomFindMany = jest.fn()
      .mockResolvedValueOnce([{ id: 'cA' }])                                // allSubjectWhere sınıfları
      .mockResolvedValueOnce([{ id: 'cA' }, { id: 'cB' }])                  // subjectSpan sınıfları (cB yalnız branş)
      .mockResolvedValueOnce([
        { id: 'cA', name: 'A', gradeLevel: 5, branchId: 'b1', _count: { students: 2 } },
        { id: 'cB', name: 'B', gradeLevel: 6, branchId: 'b1', _count: { students: 1 } },
      ]);
    const asgFindMany = jest.fn().mockResolvedValue([{ id: 'a1', classroomId: 'cA' }, { id: 'a2', classroomId: 'cB' }]);
    read.mockReturnValue({
      classroom: { findMany: classroomFindMany },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', name: 'B1' }]) },
      schoolAssignment: { findMany: asgFindMany },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([
        { totalScore: 8, maxScore: 10, submittedAt: new Date('2026-03-01'), assignment: { classroomId: 'cA', exam: { department: { name: 'Mat' } } } },
      ]) },
    });
    const r = await new GetFilteredReportUseCase().execute({}, 'uCombo');
    const asgWhere = asgFindMany.mock.calls[0][0].where;
    expect(JSON.stringify(asgWhere)).toContain('departmentId');
    expect(r.classrooms.length).toBe(2);
  });

  it('UI zümre filtresi (departmentId) ödev/teslim sorgusuna exam.departmentId ekler', async () => {
    p.schoolUser.findFirst.mockResolvedValue(admin);
    const asgFindMany = jest.fn().mockResolvedValue([]);
    read.mockReturnValue({
      classroom: { findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 'c1' }])
        .mockResolvedValueOnce([{ id: 'c1', name: '5-A', gradeLevel: 5, branchId: 'b1', _count: { students: 1 } }]) },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', name: 'B1' }]) },
      schoolAssignment: { findMany: asgFindMany },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    });
    await new GetFilteredReportUseCase().execute({ departmentId: 'dQ' }, 'u0');
    expect(JSON.stringify(asgFindMany.mock.calls[0][0].where)).toContain('dQ');
  });

  it('çok şube/gün: null-avg şube sıralaması + 3 günlük zaman serisi sıralaması', async () => {
    p.schoolUser.findFirst.mockResolvedValue(admin);
    read.mockReturnValue({
      classroom: { findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }])
        .mockResolvedValueOnce([
          { id: 'c1', name: '5-A', gradeLevel: 5, branchId: 'b1', _count: { students: 3 } },
          { id: 'c3', name: '5-B', gradeLevel: 5, branchId: 'b1', _count: { students: 2 } }, // aynı seviye 2. sınıf → bestClassByLevel sort comparator çalışır
          { id: 'c2', name: '6-B', gradeLevel: 6, branchId: 'b2', _count: { students: 2 } }, // teslimsiz → b2 avg null (ortada)
          { id: 'c4', name: '7-A', gradeLevel: 7, branchId: 'b3', _count: { students: 4 } }, // b3 avg dolu → 3 şube karışık (sort ?? -1 iki yön)
        ]) },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', name: 'B1' }, { id: 'b2', name: 'B2' }, { id: 'b3', name: 'B3' }]) },
      schoolAssignment: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', classroomId: 'c1' }]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([
        { totalScore: 9, maxScore: 10, submittedAt: new Date('2026-03-03'), assignment: { classroomId: 'c1', exam: { department: { name: 'Mat' } } } },
        { totalScore: 7, maxScore: 10, submittedAt: new Date('2026-03-01'), assignment: { classroomId: 'c1', exam: { department: { name: 'Mat' } } } },
        { totalScore: 5, maxScore: 10, submittedAt: new Date('2026-03-02'), assignment: { classroomId: 'c1', exam: { department: { name: 'Fen' } } } },
        { totalScore: 6, maxScore: 10, submittedAt: new Date('2026-03-02'), assignment: { classroomId: 'c3', exam: { department: { name: 'Mat' } } } },
        { totalScore: 4, maxScore: 10, submittedAt: new Date('2026-03-02'), assignment: { classroomId: 'c4', exam: { department: { name: 'Mat' } } } },
      ]) },
    });
    const r = await new GetFilteredReportUseCase().execute({}, 'u0');
    expect(r.branches.find((b: any) => b.id === 'b2')!.avgPercent).toBeNull(); // sort: null tarafı
    expect(r.branches.find((b: any) => b.id === 'b1')!.avgPercent).not.toBeNull();
    expect(r.timeseries.map((t: any) => t.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']); // 3 gün → ternary iki yön
    expect(r.byDepartment.length).toBe(2);
    // grade5'te 2 sınıf → en iyi sınıf seçimi (sort comparator) çalışır
    expect(r.highlights.bestClassByLevel.find((x: any) => x.gradeLevel === 5)).toBeTruthy();
  });

  it('periodId verilince ödev/teslim sorgusu döneme kısıtlanır', async () => {
    p.schoolUser.findFirst.mockResolvedValue(admin);
    const asgFindMany = jest.fn().mockResolvedValue([]);
    const subFindMany = jest.fn().mockResolvedValue([]);
    read.mockReturnValue({
      classroom: { findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 'c1' }])
        .mockResolvedValueOnce([{ id: 'c1', name: '5-A', gradeLevel: 5, branchId: 'b1', _count: { students: 1 } }]) },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', name: 'B1' }]) },
      schoolAssignment: { findMany: asgFindMany },
      schoolSubmission: { findMany: subFindMany },
    });
    await new GetFilteredReportUseCase().execute({ periodId: 'p-2025' }, 'u0');
    expect(JSON.stringify(asgFindMany.mock.calls[0][0].where)).toContain('p-2025'); // AND[{OR},{periodId}]
    expect(subFindMany.mock.calls[0][0].where.assignment).toMatchObject({ periodId: 'p-2025' });
  });

  it('tarih aralığı: yalnız from / yalnız to / geçersiz tarih', async () => {
    p.schoolUser.findFirst.mockResolvedValue(admin);
    const submissionFindMany = jest.fn().mockResolvedValue([]);
    const mk = () => read.mockReturnValue({
      classroom: { findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 'c1' }])
        .mockResolvedValueOnce([{ id: 'c1', name: '5-A', gradeLevel: 5, branchId: 'b1', _count: { students: 1 } }]) },
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', name: 'B1' }]) },
      schoolAssignment: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', classroomId: 'c1' }]) },
      schoolSubmission: { findMany: submissionFindMany },
    });
    mk();
    await new GetFilteredReportUseCase().execute({ from: '2026-01-01' }, 'u0');
    expect(submissionFindMany.mock.calls[0][0].where.submittedAt).toMatchObject({ gte: expect.any(Date) });
    expect(submissionFindMany.mock.calls[0][0].where.submittedAt.lte).toBeUndefined();
    submissionFindMany.mockClear(); mk();
    await new GetFilteredReportUseCase().execute({ to: '2026-06-01' }, 'u0');
    expect(submissionFindMany.mock.calls[0][0].where.submittedAt).toMatchObject({ lte: expect.any(Date) });
    submissionFindMany.mockClear(); mk();
    await new GetFilteredReportUseCase().execute({ from: 'gecersiz', to: 'yok' }, 'u0');
    expect(submissionFindMany.mock.calls[0][0].where.submittedAt).toBeUndefined();
  });
});

describe('GetClassroomReportUseCase — kenar dalları', () => {
  it('boş kapsam → CLASSROOM_NOT_FOUND', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'TEACHER', departmentId: null });
    await expect(new GetClassroomReportUseCase().execute('c1', {}, 'uMember')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });

  it('zümre başkanı (branş-span erişim) + zümre filtresi + öğrenci ad fallback + branch null', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'DEPT_HEAD', branchId: null, departmentId: 'd1' });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'd1', levelId: 'lv7', branchId: null }]);
    // DEPT_HEAD'te allSubjectWhere boş → yalnız subjectSpan findFirst çağrılır.
    const clsFindFirst = jest.fn().mockResolvedValue({ id: 'c1', name: '5-A', gradeLevel: 5, branch: null, _count: { students: 2 } });
    read.mockReturnValue({
      classroom: { findFirst: clsFindFirst },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([
        { totalScore: 8, maxScore: 10, student: { id: 's1', username: 'ALEF-S-1', firstName: 'Ali', lastName: 'V' }, assignment: { id: 'a1', title: 'Ödev', exam: { department: { name: 'Mat' } } } },
        { totalScore: null, maxScore: 10, student: { id: 's2', username: 'ALEF-S-2', firstName: null, lastName: null }, assignment: { id: 'a2', title: 'Ödev2', exam: { department: null } } }, // ad fallback + zümresiz + null skor
      ]) },
    });
    const r = await new GetClassroomReportUseCase().execute('c1', { departmentId: 'd1' }, 'uHead');
    expect(r.classroom.branchName).toBe('—');
    expect(r.students.find((s: any) => s.name === 'ALEF-S-2')).toBeTruthy();
    expect(r.departments.map((d: any) => d.name)).toEqual(expect.arrayContaining(['Mat', 'Zümresiz']));
  });

  it('zümre başkanı erişemediği sınıf → CLASSROOM_NOT_FOUND', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'DEPT_HEAD', branchId: null, departmentId: 'd1' });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'd1', levelId: 'lv7', branchId: null }]);
    read.mockReturnValue({ classroom: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(new GetClassroomReportUseCase().execute('cX', {}, 'uHead')).rejects.toMatchObject({ code: 'CLASSROOM_NOT_FOUND' });
  });

  it('zümre başkanı + departmentId YOK + tarih aralığı → branş-span deptWhere; 3 öğrenci sıralaması', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'DEPT_HEAD', branchId: null, departmentId: 'd1' });
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'd1', levelId: 'lv7', branchId: null }]);
    const subFindMany = jest.fn().mockResolvedValue([
      { totalScore: 9, maxScore: 10, student: { id: 's1', username: 'S1', firstName: 'A', lastName: 'A' }, assignment: { id: 'a1', title: 'Ö1', exam: { department: { name: 'Mat' } } } },
      { totalScore: null, maxScore: 10, student: { id: 's2', username: 'S2', firstName: null, lastName: null }, assignment: { id: 'a1', title: 'Ö1', exam: { department: { name: 'Mat' } } } }, // s2 avg null (ortada)
      { totalScore: 4, maxScore: 10, student: { id: 's3', username: 'S3', firstName: 'C', lastName: 'C' }, assignment: { id: 'a2', title: 'Ö2', exam: { department: { name: 'Mat' } } } },
    ]);
    read.mockReturnValue({
      classroom: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', name: '5-A', gradeLevel: 5, branch: { name: 'B1' }, _count: { students: 3 } }) },
      schoolSubmission: { findMany: subFindMany },
    });
    const r = await new GetClassroomReportUseCase().execute('c1', { from: '2026-01-01', to: '2026-06-01' }, 'uHead');
    // deptWhere = exam.departmentId in subjectDeptIds (departmentId verilmedi, branş erişimi)
    expect(JSON.stringify(subFindMany.mock.calls[0][0].where.assignment)).toContain('departmentId');
    expect(subFindMany.mock.calls[0][0].where.submittedAt).toMatchObject({ gte: expect.any(Date), lte: expect.any(Date) });
    expect(r.students).toHaveLength(3);
  });

  it('seviye sorumlusu (allSubjectWhere) tüm-ders erişimi → departmentId filtresiz', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...admin, schoolRole: 'TEACHER', branchId: null, departmentId: null });
    p.schoolLevel.findMany.mockResolvedValue([{ id: 'lv5' }]); // seviye sorumlusu
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    read.mockReturnValue({
      classroom: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', name: '5-A', gradeLevel: 5, branch: { name: 'B1' }, _count: { students: 1 } }) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const r = await new GetClassroomReportUseCase().execute('c1', {}, 'uLvl');
    expect(r.classroom.branchName).toBe('B1');
    expect(r.summary).toMatchObject({ submissionCount: 0, avgPercent: null });
  });
});

describe('GetBranchReportUseCase — kenar dalları', () => {
  it('sınıfların bir kısmı boş + null skorlu teslim → fallback değerler', async () => {
    p.schoolUser.findFirst.mockResolvedValue(admin);
    read.mockReturnValue({
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 'b1', name: 'B1' }) },
      classroom: { findMany: jest.fn().mockResolvedValue([
        { id: 'c1', name: '5-B', gradeLevel: 5, _count: { students: 3 } },
        { id: 'c2', name: '5-A', gradeLevel: 5, _count: { students: 0 } }, // aynı seviye → sort `||` localeCompare dalı; ödev/teslim yok → fallback
      ]) },
      schoolAssignment: { groupBy: jest.fn().mockResolvedValue([{ classroomId: 'c1', _count: { _all: 2 } }]) },
      schoolSubmission: { findMany: jest.fn().mockResolvedValue([
        { totalScore: 9, maxScore: 10, assignment: { classroomId: 'c1' } },
        { totalScore: null, maxScore: 10, assignment: { classroomId: 'c1' } }, // null skor → pct yok
      ]) },
    });
    const r = await new GetBranchReportUseCase().execute('b1', 'u0');
    const c2 = r.classrooms.find((c: any) => c.id === 'c2');
    expect(c2).toMatchObject({ assignmentCount: 0, submissionCount: 0, avgPercent: null });
  });
});
