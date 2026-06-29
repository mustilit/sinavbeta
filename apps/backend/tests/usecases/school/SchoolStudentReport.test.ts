/**
 * GetStudentReportUseCase — öğrencinin ders/konu/takvim başarımı.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: { schoolUser: { findFirst: jest.fn() } },
}));
jest.mock('../../../src/infrastructure/database/dbRouter', () => ({
  prismaRead: jest.fn(),
}));

import { GetStudentReportUseCase } from '../../../src/application/use-cases/school/SchoolStudentUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { prismaRead } from '../../../src/infrastructure/database/dbRouter';

const p = prisma as any;
const read = prismaRead as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue({ id: 'su1', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1' });
});

it('öğrenci değilse FORBIDDEN_SCHOOL_ROLE', async () => {
  p.schoolUser.findFirst.mockResolvedValue({ id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: null, classroomId: null });
  read.mockReturnValue({ classroom: { findUnique: jest.fn() }, schoolSubmission: { findMany: jest.fn() } });
  await expect(new GetStudentReportUseCase().execute('u1', {})).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
});

it('çözülen soru sayısı + ders + konu + takvim başarımı hesaplanır', async () => {
  read.mockReturnValue({
    classroom: { findUnique: jest.fn().mockResolvedValue({ gradeLevel: 5 }) },
    schoolSubmission: {
      findMany: jest.fn().mockResolvedValue([
        { totalScore: 8, maxScore: 10, submittedAt: new Date('2026-06-01T10:00:00Z'), _count: { answers: 10 }, assignment: { exam: { topic: 'Kesirler', department: { name: 'Matematik' } } } },
        { totalScore: 5, maxScore: 10, submittedAt: new Date('2026-06-02T10:00:00Z'), _count: { answers: 8 }, assignment: { exam: { topic: null, department: { name: 'Türkçe' } } } },
      ]),
    },
  });
  const r = await new GetStudentReportUseCase().execute('u1', {});
  expect(r.level).toBe(5);
  expect(r.summary).toEqual({ submissionCount: 2, avgPercent: 65, questionCount: 18 });
  expect(r.bySubject).toEqual(expect.arrayContaining([
    { name: 'Matematik', avgPercent: 80, count: 1, questionCount: 10 },
    { name: 'Türkçe', avgPercent: 50, count: 1, questionCount: 8 },
  ]));
  expect(r.byTopic.find((t: any) => t.name === 'Kesirler')).toEqual({ name: 'Kesirler', avgPercent: 80, count: 1, questionCount: 10 });
  expect(r.byTopic.find((t: any) => t.name === 'Konusuz')).toBeTruthy();
  expect(r.timeseries).toHaveLength(2);
  expect(r.timeseries[0]).toHaveProperty('questionCount');
});

it('puanlanmamış teslim → çözülen soruya girer, başarıma girmez', async () => {
  read.mockReturnValue({
    classroom: { findUnique: jest.fn().mockResolvedValue({ gradeLevel: 5 }) },
    schoolSubmission: {
      findMany: jest.fn().mockResolvedValue([
        // WRITTEN, henüz puanlanmadı (totalScore null) — soru sayısı sayılır, ortalama null
        { totalScore: null, maxScore: 20, submittedAt: new Date('2026-06-03T10:00:00Z'), _count: { answers: 4 }, assignment: { exam: { topic: 'Yorum', department: { name: 'Türkçe' } } } },
      ]),
    },
  });
  const r = await new GetStudentReportUseCase().execute('u1', {});
  expect(r.summary).toEqual({ submissionCount: 1, avgPercent: null, questionCount: 4 });
  expect(r.bySubject[0]).toEqual({ name: 'Türkçe', avgPercent: null, count: 1, questionCount: 4 });
});

it('teslim yoksa boş özet', async () => {
  read.mockReturnValue({
    classroom: { findUnique: jest.fn().mockResolvedValue({ gradeLevel: 6 }) },
    schoolSubmission: { findMany: jest.fn().mockResolvedValue([]) },
  });
  const r = await new GetStudentReportUseCase().execute('u1', {});
  expect(r.summary).toEqual({ submissionCount: 0, avgPercent: null, questionCount: 0 });
  expect(r.bySubject).toEqual([]);
});
