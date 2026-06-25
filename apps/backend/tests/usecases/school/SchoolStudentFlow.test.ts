/**
 * E-Sınıf öğrenci akışı — GÜVENLİK: çözme ekranı doğru cevap sızdırmaz;
 * sonuç görünürlüğü (SUBMIT/DUE_DATE/TEACHER_RELEASE); başlat/cevap kilitleri.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolAssignment: { findFirst: jest.fn() },
    schoolSubmission: { findUnique: jest.fn(), create: jest.fn() },
    schoolSubmissionAnswer: { upsert: jest.fn() },
  },
}));

import {
  GetStudentAssignmentUseCase,
  GetStudentResultUseCase,
  StartSubmissionUseCase,
  SaveAnswerUseCase,
} from '../../../src/application/use-cases/school/SchoolStudentUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const student = { id: 'su1', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1' };
const past = new Date(Date.now() - 86400000);
const future = new Date(Date.now() + 86400000);

function asg(over = {}) {
  return {
    id: 'a1', title: 'Ödev', status: 'ACTIVE', availableFrom: past, dueDate: future, allowLateSubmit: false,
    showResultAfter: 'SUBMIT', resultsReleased: false, classroomId: 'c1',
    exam: { examType: 'TEST', questions: [{ id: 'q1', content: 'S1', mediaUrl: null, points: 1, order: 1, options: [{ id: 'o1', content: 'A', isCorrect: true, order: 1 }, { id: 'o2', content: 'B', isCorrect: false, order: 2 }] }] },
    ...over,
  };
}

describe('GetStudentAssignmentUseCase — doğru cevap sızmaz', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(student); });

  it('şık nesnelerinde isCorrect bulunmaz (yalnız id+content)', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(asg());
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    const r = await new GetStudentAssignmentUseCase().execute('a1', 'stu1');
    const opt = r.questions[0].options[0];
    expect(Object.keys(opt).sort()).toEqual(['content', 'id']);
    expect('isCorrect' in opt).toBe(false);
  });
});

describe('GetStudentResultUseCase — görünürlük', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(student); });

  it('SUBMIT: teslim sonrası görünür', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(asg({ showResultAfter: 'SUBMIT' }));
    p.schoolSubmission.findUnique.mockResolvedValue({ status: 'GRADED', totalScore: 1, maxScore: 1, answers: [{ questionId: 'q1', selectedOptionId: 'o1', isCorrect: true, earnedPoints: 1 }] });
    const r = await new GetStudentResultUseCase().execute('a1', 'stu1');
    expect(r.visible).toBe(true);
  });
  it('TEACHER_RELEASE: yayımlanmadıysa görünmez', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(asg({ showResultAfter: 'TEACHER_RELEASE', resultsReleased: false }));
    p.schoolSubmission.findUnique.mockResolvedValue({ status: 'GRADED', answers: [] });
    const r = await new GetStudentResultUseCase().execute('a1', 'stu1');
    expect(r.visible).toBe(false);
    expect(r.reason).toBe('TEACHER_RELEASE');
  });
  it('DUE_DATE: son tarih geçmediyse görünmez', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(asg({ showResultAfter: 'DUE_DATE', dueDate: future }));
    p.schoolSubmission.findUnique.mockResolvedValue({ status: 'GRADED', answers: [] });
    const r = await new GetStudentResultUseCase().execute('a1', 'stu1');
    expect(r.visible).toBe(false);
  });
  it('teslim edilmemişse → NOT_SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(asg());
    p.schoolSubmission.findUnique.mockResolvedValue({ status: 'IN_PROGRESS', answers: [] });
    await expect(new GetStudentResultUseCase().execute('a1', 'stu1')).rejects.toMatchObject({ code: 'NOT_SUBMITTED' });
  });
});

describe('StartSubmissionUseCase', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(student); });

  it('süresi geçmiş + geç teslim kapalı → ASSIGNMENT_CLOSED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: past, dueDate: past, allowLateSubmit: false });
    await expect(new StartSubmissionUseCase().execute('a1', 'stu1')).rejects.toMatchObject({ code: 'ASSIGNMENT_CLOSED' });
  });
  it('zaten teslim edilmiş → ALREADY_SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: past, dueDate: future, allowLateSubmit: false });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 's1', status: 'GRADED' });
    await expect(new StartSubmissionUseCase().execute('a1', 'stu1')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });
  it('ilk başlatma → submission oluşturulur', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: past, dueDate: future, allowLateSubmit: false });
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    p.schoolSubmission.create.mockResolvedValue({ id: 's-new' });
    const r = await new StartSubmissionUseCase().execute('a1', 'stu1');
    expect(r).toEqual({ submissionId: 's-new', resumed: false });
  });
});

describe('SaveAnswerUseCase — teslim sonrası kilit', () => {
  beforeEach(() => { jest.clearAllMocks(); p.schoolUser.findFirst.mockResolvedValue(student); });

  it('teslim edilmiş submission → ALREADY_SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: past, dueDate: future, allowLateSubmit: false });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 's1', status: 'SUBMITTED' });
    await expect(new SaveAnswerUseCase().execute('a1', { questionId: 'q1', selectedOptionId: 'o1' }, 'stu1')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });
  it('IN_PROGRESS → cevap upsert edilir', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: past, dueDate: future, allowLateSubmit: false });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 's1', status: 'IN_PROGRESS' });
    p.schoolSubmissionAnswer.upsert.mockResolvedValue({});
    const r = await new SaveAnswerUseCase().execute('a1', { questionId: 'q1', selectedOptionId: 'o1' }, 'stu1');
    expect(r).toEqual({ ok: true });
    expect(p.schoolSubmissionAnswer.upsert).toHaveBeenCalled();
  });
});
