/**
 * GradeSubmissionUseCase — yazılı puanlama: clamp (0..max), toplam, GRADED,
 * yetki (sahibi/zümre başkanı) ve tür/durum kenarları.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolSubmission: { findUnique: jest.fn(), update: jest.fn() },
    schoolSubmissionAnswer: { update: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (ops: any[]) => ops),
  },
}));

import { GradeSubmissionUseCase, GetSubmissionForGradingUseCase } from '../../../src/application/use-cases/school/SchoolGradingUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const teacherCtx = { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'dept1', classroomId: null };

function writtenSub(overrides: any = {}) {
  return {
    id: 'sub1', status: 'SUBMITTED',
    answers: [{ id: 'an1', questionId: 'q1' }, { id: 'an2', questionId: 'q2' }],
    assignment: { schoolId: 'sch1', createdById: 'u1', exam: { examType: 'WRITTEN', departmentId: 'dept1', questions: [{ id: 'q1', points: 10 }, { id: 'q2', points: 5 }] } },
    ...overrides,
  };
}

describe('GradeSubmissionUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(teacherCtx);
  });

  it('başarı: puanlar clamp edilir, toplam + GRADED döner', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub());
    const r = await new GradeSubmissionUseCase().execute('sub1', { grades: [{ questionId: 'q1', earnedPoints: 8 }, { questionId: 'q2', earnedPoints: 99 }], feedback: 'iyi' }, 'u1');
    // q2 max 5'e clamp → 8 + 5 = 13 ; maxScore 15
    expect(r).toEqual({ status: 'GRADED', totalScore: 13, maxScore: 15 });
  });

  it('negatif puan 0 a clamp', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub());
    const r = await new GradeSubmissionUseCase().execute('sub1', { grades: [{ questionId: 'q1', earnedPoints: -3 }, { questionId: 'q2', earnedPoints: 5 }] }, 'u1');
    expect(r.totalScore).toBe(5);
  });

  it('başkasının ödevi (yetkisiz) → FORBIDDEN', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub({ assignment: { schoolId: 'sch1', createdById: 'other', exam: { examType: 'WRITTEN', departmentId: 'deptX', questions: [] } } }));
    await expect(new GradeSubmissionUseCase().execute('sub1', { grades: [] }, 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('zümre başkanı kendi zümresini puanlayabilir', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacherCtx, schoolRole: 'DEPT_HEAD' });
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub({ assignment: { schoolId: 'sch1', createdById: 'other', exam: { examType: 'WRITTEN', departmentId: 'dept1', questions: [{ id: 'q1', points: 10 }, { id: 'q2', points: 5 }] } } }));
    const r = await new GradeSubmissionUseCase().execute('sub1', { grades: [{ questionId: 'q1', earnedPoints: 10 }, { questionId: 'q2', earnedPoints: 5 }] }, 'u1');
    expect(r.totalScore).toBe(15);
  });

  it('teslim edilmemiş (IN_PROGRESS) → NOT_SUBMITTED', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub({ status: 'IN_PROGRESS' }));
    await expect(new GradeSubmissionUseCase().execute('sub1', { grades: [] }, 'u1')).rejects.toMatchObject({ code: 'NOT_SUBMITTED' });
  });

  it('TEST (yazılı değil) → NOT_WRITTEN', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub({ assignment: { schoolId: 'sch1', createdById: 'u1', exam: { examType: 'TEST', departmentId: 'dept1', questions: [] } } }));
    await expect(new GradeSubmissionUseCase().execute('sub1', { grades: [] }, 'u1')).rejects.toMatchObject({ code: 'NOT_WRITTEN' });
  });
});

describe('GetSubmissionForGradingUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(teacherCtx); });
  const writtenSub = (over = {}) => ({
    id: 'sub1', status: 'SUBMITTED', feedback: null, totalScore: null, maxScore: null,
    student: { username: 'ALEF-S-0001', firstName: 'Ali', lastName: 'V' },
    answers: [{ questionId: 'q1', textAnswer: 'cevap', imageUrls: [], earnedPoints: null }],
    assignment: { id: 'a1', schoolId: 'sch1', title: 'Ödev', createdById: 'u1',
      exam: { examType: 'WRITTEN', departmentId: 'dept1', questions: [{ id: 'q1', content: 'S1', points: 5, order: 1, solutionText: 'çözüm' }] } },
    ...over,
  });

  it('teslim yoksa SUBMISSION_NOT_FOUND', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    await expect(new GetSubmissionForGradingUseCase().execute('x', 'u1')).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' });
  });
  it('başka okul → SUBMISSION_NOT_FOUND', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub({ assignment: { id: 'a1', schoolId: 'OTHER', title: 'x', createdById: 'u1', exam: { examType: 'WRITTEN', departmentId: 'dept1', questions: [] } } }));
    await expect(new GetSubmissionForGradingUseCase().execute('sub1', 'u1')).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' });
  });
  it('yazılı değilse NOT_WRITTEN', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub({ assignment: { id: 'a1', schoolId: 'sch1', title: 'x', createdById: 'u1', exam: { examType: 'TEST', departmentId: 'dept1', questions: [] } } }));
    await expect(new GetSubmissionForGradingUseCase().execute('sub1', 'u1')).rejects.toMatchObject({ code: 'NOT_WRITTEN' });
  });
  it('başarı: soru + cevap + çözüm döner', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(writtenSub());
    const r = await new GetSubmissionForGradingUseCase().execute('sub1', 'u1');
    expect(r.submissionId).toBe('sub1');
    expect(r.student).toMatchObject({ username: 'ALEF-S-0001' });
    expect(r.questions[0]).toMatchObject({ questionId: 'q1', points: 5, solutionText: 'çözüm' });
  });
});
