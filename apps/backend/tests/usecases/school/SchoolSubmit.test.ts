/**
 * SubmitAssignmentUseCase — TEST otomatik puanlama + WRITTEN manuel bekletme +
 * ödev kapalı/teslim edilmiş kenar durumları.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolAssignment: { findFirst: jest.fn() },
    schoolSubmission: { findUnique: jest.fn(), update: jest.fn() },
    schoolSubmissionAnswer: { update: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { SubmitAssignmentUseCase } from '../../../src/application/use-cases/school/SchoolStudentUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const studentCtx = { id: 'su1', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'cls1' };

const futureDue = new Date(Date.now() + 86400000);
const pastFrom = new Date(Date.now() - 86400000);

function examWith(type: string) {
  return {
    id: 'a1', status: 'ACTIVE', availableFrom: pastFrom, dueDate: futureDue, allowLateSubmit: false, classroomId: 'cls1',
    exam: {
      examType: type,
      questions: [
        { id: 'q1', points: 2, options: [{ id: 'o1', isCorrect: true }, { id: 'o2', isCorrect: false }] },
        { id: 'q2', points: 3, options: [{ id: 'o3', isCorrect: false }, { id: 'o4', isCorrect: true }] },
      ],
    },
  };
}

describe('SubmitAssignmentUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.schoolUser.findFirst.mockResolvedValue(studentCtx);
    p.$transaction.mockImplementation(async (fn: any) => fn({
      schoolSubmissionAnswer: { update: jest.fn(), create: jest.fn() },
      schoolSubmission: { update: jest.fn() },
    }));
  });

  it('TEST: doğru/yanlış otomatik puanlanır, GRADED + skor döner', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(examWith('TEST'));
    p.schoolSubmission.findUnique.mockResolvedValue({
      id: 's1', status: 'IN_PROGRESS',
      answers: [
        { id: 'an1', questionId: 'q1', selectedOptionId: 'o1' }, // doğru → 2
        { id: 'an2', questionId: 'q2', selectedOptionId: 'o3' }, // yanlış → 0
      ],
    });
    const r = await new SubmitAssignmentUseCase().execute('a1', 'stu1');
    expect(r).toEqual({ status: 'GRADED', totalScore: 2, maxScore: 5 });
  });

  it('TEST: hepsi doğru → tam puan', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(examWith('TEST'));
    p.schoolSubmission.findUnique.mockResolvedValue({
      id: 's1', status: 'IN_PROGRESS',
      answers: [{ id: 'an1', questionId: 'q1', selectedOptionId: 'o1' }, { id: 'an2', questionId: 'q2', selectedOptionId: 'o4' }],
    });
    const r = await new SubmitAssignmentUseCase().execute('a1', 'stu1');
    expect(r).toEqual({ status: 'GRADED', totalScore: 5, maxScore: 5 });
  });

  it('WRITTEN: otomatik puanlanmaz → SUBMITTED, skor null, maxScore toplam', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(examWith('WRITTEN'));
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 's1', status: 'IN_PROGRESS', answers: [] });
    const r = await new SubmitAssignmentUseCase().execute('a1', 'stu1');
    expect(r).toEqual({ status: 'SUBMITTED', totalScore: null, maxScore: 5 });
  });

  it('zaten teslim → ALREADY_SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(examWith('TEST'));
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 's1', status: 'GRADED', answers: [] });
    await expect(new SubmitAssignmentUseCase().execute('a1', 'stu1')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });

  it('süresi geçmiş + geç teslim kapalı → ASSIGNMENT_CLOSED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ ...examWith('TEST'), dueDate: new Date(Date.now() - 1000), allowLateSubmit: false });
    await expect(new SubmitAssignmentUseCase().execute('a1', 'stu1')).rejects.toMatchObject({ code: 'ASSIGNMENT_CLOSED' });
  });

  it('öğrenci değilse → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...studentCtx, schoolRole: 'TEACHER' });
    await expect(new SubmitAssignmentUseCase().execute('a1', 'stu1')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });
});
