/**
 * E-Sınıf ödev uyum raporu — öğrenci yolu (self scope).
 * Statü (zamanında/geç/teslim edilmeyen) + süre (içinde/aşım) sayımları.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    school: { findUnique: jest.fn() },
  },
}));
jest.mock('../../../src/infrastructure/database/dbRouter', () => ({ prismaRead: jest.fn() }));

import { GetSchoolComplianceUseCase, ListSchoolComplianceUseCase } from '../../../src/application/use-cases/school/SchoolComplianceUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { prismaRead } from '../../../src/infrastructure/database/dbRouter';

const p = prisma as any;
const read = prismaRead as jest.Mock;

const day = 86400000;
const now = Date.now();
const past = new Date(now - 5 * day);
const future = new Date(now + 5 * day);

beforeEach(() => {
  jest.clearAllMocks();
  // resolveSchoolContext → STUDENT (classroomId c1)
  p.schoolUser.findFirst.mockResolvedValue({ id: 'su1', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1' });
  // resolvePeriodFilter → currentPeriodId
  p.school.findUnique.mockResolvedValue({ periodId: 'p1' });
});

function mockData(assignments: any[], submissions: any[]) {
  read.mockReturnValue({
    schoolAssignment: { findMany: jest.fn().mockResolvedValue(assignments) },
    schoolSubmission: { findMany: jest.fn().mockResolvedValue(submissions) },
  });
}

describe('GetSchoolComplianceUseCase — öğrenci', () => {
  it('zamanında/geç/teslim edilmeyen + süre içinde/aşım sayar', async () => {
    const exam = (dur: number | null) => ({ title: 'S', durationMinutes: dur });
    const assignments = [
      { id: 'a1', title: 'A1', classroomId: 'c1', dueDate: past, exam: exam(20) },   // süresi geçmiş
      { id: 'a2', title: 'A2', classroomId: 'c1', dueDate: past, exam: exam(20) },   // süresi geçmiş, teslim edilmemiş
      { id: 'a3', title: 'A3', classroomId: 'c1', dueDate: future, exam: exam(null) }, // gelecekte, teslim yok → notSubmitted sayılmaz
    ];
    const submissions = [
      // a1: zamanında (submittedAt <= due) + süre içinde (10dk <= 20)
      { assignmentId: 'a1', studentId: 'su1', status: 'GRADED', startedAt: new Date(past.getTime() - 10 * 60000), submittedAt: new Date(past.getTime() - 1), assignment: { title: 'A1', dueDate: past, exam: exam(20) } },
    ];
    mockData(assignments, submissions);

    const r = await new GetSchoolComplianceUseCase().execute('su1');
    expect(r.scope).toBe('student');
    expect(r.status.onTime).toBe(1);
    expect(r.status.late).toBe(0);
    expect(r.status.notSubmitted).toBe(1); // yalnız a2 (a3 süresi geçmemiş)
    expect(r.duration.withinTime).toBe(1);
    expect(r.duration.overflow).toBe(0);
  });

  it('geç teslim + süre aşımı', async () => {
    const assignments = [{ id: 'a1', title: 'A1', classroomId: 'c1', dueDate: past, exam: { title: 'S', durationMinutes: 20 } }];
    const submissions = [
      // submittedAt > due → geç; geçen süre 40dk > 20 → aşım
      { assignmentId: 'a1', studentId: 'su1', status: 'SUBMITTED', startedAt: new Date(past.getTime() + 1), submittedAt: new Date(past.getTime() + 40 * 60000), assignment: { title: 'A1', dueDate: past, exam: { title: 'S', durationMinutes: 20 } } },
    ];
    mockData(assignments, submissions);
    const r = await new GetSchoolComplianceUseCase().execute('su1');
    expect(r.status.late).toBe(1);
    expect(r.status.onTime).toBe(0);
    expect(r.duration.overflow).toBe(1);
    expect(r.duration.withinTime).toBe(0);
  });
});

describe('ListSchoolComplianceUseCase — öğrenci drill-down', () => {
  it('notSubmitted listesi süresi geçmiş teslim edilmemiş ödevleri verir', async () => {
    const assignments = [
      { id: 'a1', title: 'A1', classroomId: 'c1', dueDate: past, exam: { title: 'Mat', durationMinutes: null } },
      { id: 'a2', title: 'A2', classroomId: 'c1', dueDate: future, exam: { title: 'Fen', durationMinutes: null } },
    ];
    mockData(assignments, []);
    const r = await new ListSchoolComplianceUseCase().execute('notSubmitted', 'su1');
    expect(r.bucket).toBe('notSubmitted');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].assignmentTitle).toBe('A1');
  });
});
