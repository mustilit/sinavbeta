/**
 * E-Sınıf SchoolGrading — branch (dal) kapsamı.
 * not-found/cross-school, FORBIDDEN, NOT_WRITTEN, NOT_SUBMITTED, cevaplı/cevapsız puanlama,
 * ad/çözüm/cevap ?? fallback'leri.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolSubmission: { findUnique: jest.fn(), update: jest.fn(async () => ({})) },
    schoolSubmissionAnswer: { update: jest.fn(async () => ({})), create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (ops: any) => Promise.all(ops)),
  },
}));

import { GetSubmissionForGradingUseCase, GradeSubmissionUseCase } from '../../../src/application/use-cases/school/SchoolGradingUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const teacher = { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'd1', classroomId: null };
beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(teacher); });

const sub = (over: any = {}) => ({
  id: 'sub1', status: 'SUBMITTED', feedback: null, totalScore: null, maxScore: 5,
  student: { username: 'S1', firstName: null, lastName: null },
  answers: [],
  assignment: { id: 'a1', schoolId: 'sch1', title: 'Ödev', createdById: 'u1', exam: { examType: 'WRITTEN', departmentId: 'd1', questions: [{ id: 'q1', content: 'S', points: 5, solutionText: null, order: 1 }] } },
  ...over,
});

describe('GetSubmissionForGrading', () => {
  it('teslim yok → SUBMISSION_NOT_FOUND', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    await expect(new GetSubmissionForGradingUseCase().execute('sX', 'u1')).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' });
  });
  it('başka okul → SUBMISSION_NOT_FOUND', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(sub({ assignment: { ...sub().assignment, schoolId: 'other' } }));
    await expect(new GetSubmissionForGradingUseCase().execute('sub1', 'u1')).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' });
  });
  it('yetkisiz öğretmen → FORBIDDEN', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(sub({ assignment: { ...sub().assignment, createdById: 'other', exam: { ...sub().assignment.exam, departmentId: 'dX' } } }));
    await expect(new GetSubmissionForGradingUseCase().execute('sub1', 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('yazılı değil → NOT_WRITTEN', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(sub({ assignment: { ...sub().assignment, exam: { ...sub().assignment.exam, examType: 'TEST' } } }));
    await expect(new GetSubmissionForGradingUseCase().execute('sub1', 'u1')).rejects.toMatchObject({ code: 'NOT_WRITTEN' });
  });
  it('zümre başkanı (dept eşleşir) → görür; cevapsız soru fallback + öğrenci ad null', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...teacher, schoolRole: 'DEPT_HEAD' });
    p.schoolSubmission.findUnique.mockResolvedValue(sub({ assignment: { ...sub().assignment, createdById: 'other' } })); // dept d1 eşleşir
    const r = await new GetSubmissionForGradingUseCase().execute('sub1', 'u1');
    expect(r.student.name).toBeNull();
    expect(r.questions[0]).toMatchObject({ textAnswer: null, imageUrls: [], earnedPoints: null, solutionText: null });
  });
  it('cevaplı soru → textAnswer/imageUrls döner', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(sub({ answers: [{ questionId: 'q1', textAnswer: 'cevap', imageUrls: ['u1'], earnedPoints: 3 }], student: { username: 'S1', firstName: 'Ali', lastName: 'V' } }));
    const r = await new GetSubmissionForGradingUseCase().execute('sub1', 'u1');
    expect(r.student.name).toBe('Ali V');
    expect(r.questions[0]).toMatchObject({ textAnswer: 'cevap', earnedPoints: 3 });
  });
});

describe('GradeSubmission', () => {
  it('teslim yok → SUBMISSION_NOT_FOUND', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    await expect(new GradeSubmissionUseCase().execute('sX', { grades: [] }, 'u1')).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' });
  });
  it('yetkisiz → FORBIDDEN', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue({ status: 'SUBMITTED', answers: [], assignment: { schoolId: 'sch1', createdById: 'other', exam: { examType: 'WRITTEN', departmentId: 'dX', questions: [] } } });
    await expect(new GradeSubmissionUseCase().execute('sub1', { grades: [] }, 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('yazılı değil → NOT_WRITTEN', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue({ status: 'SUBMITTED', answers: [], assignment: { schoolId: 'sch1', createdById: 'u1', exam: { examType: 'TEST', departmentId: 'd1', questions: [] } } });
    await expect(new GradeSubmissionUseCase().execute('sub1', { grades: [] }, 'u1')).rejects.toMatchObject({ code: 'NOT_WRITTEN' });
  });
  it('teslim edilmemiş → NOT_SUBMITTED', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue({ status: 'IN_PROGRESS', answers: [], assignment: { schoolId: 'sch1', createdById: 'u1', exam: { examType: 'WRITTEN', departmentId: 'd1', questions: [] } } });
    await expect(new GradeSubmissionUseCase().execute('sub1', { grades: [] }, 'u1')).rejects.toMatchObject({ code: 'NOT_SUBMITTED' });
  });
  it('cevaplı soru update + cevapsız soru create + grade verilmeyen clamp 0', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue({
      id: 'sub1', status: 'SUBMITTED', answers: [{ id: 'ans1', questionId: 'q1' }], // q1 cevaplı, q2 cevapsız
      assignment: { schoolId: 'sch1', createdById: 'u1', exam: { examType: 'WRITTEN', departmentId: 'd1', questions: [{ id: 'q1', points: 5 }, { id: 'q2', points: 3 }] } },
    });
    const r = await new GradeSubmissionUseCase().execute('sub1', { grades: [{ questionId: 'q1', earnedPoints: 10 }], feedback: '  iyi  ' }, 'u1'); // 10 clamp→5; q2 grade yok→0
    expect(r).toMatchObject({ status: 'GRADED', totalScore: 5, maxScore: 8 });
    expect(p.schoolSubmissionAnswer.update).toHaveBeenCalled();
    expect(p.schoolSubmissionAnswer.create).toHaveBeenCalled();
  });
  it('grades alanı yok (?? []) → tüm sorular 0', async () => {
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'SUBMITTED', answers: [], assignment: { schoolId: 'sch1', createdById: 'u1', exam: { examType: 'WRITTEN', departmentId: 'd1', questions: [{ id: 'q1', points: 5 }] } } });
    const r = await new GradeSubmissionUseCase().execute('sub1', {} as any, 'u1');
    expect(r).toMatchObject({ status: 'GRADED', totalScore: 0, maxScore: 5 });
  });
});
