/**
 * E-Sınıf SchoolStudent — branch (dal) kapsamı.
 * isOpen/resultVisible dalları, classroomId ?? __none__, not-found/closed/not-started,
 * TEST vs WRITTEN, cevaplı/cevapsız puanlama, öğrenci raporu (tarih/null/Zümresiz/Konusuz).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolAssignment: { findMany: jest.fn(async () => []), findFirst: jest.fn() },
    schoolSubmission: { findUnique: jest.fn(), create: jest.fn(async () => ({ id: 'sub1' })), update: jest.fn(async () => ({})), findMany: jest.fn(async () => []) },
    schoolSubmissionAnswer: { upsert: jest.fn(async () => ({})), update: jest.fn(async () => ({})), create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: any) => fn({
      schoolSubmissionAnswer: { update: jest.fn(async () => ({})), create: jest.fn(async () => ({})) },
      schoolSubmission: { update: jest.fn(async () => ({})) },
    })),
  },
}));
jest.mock('../../../src/infrastructure/database/dbRouter', () => ({ prismaRead: jest.fn() }));

import * as Stu from '../../../src/application/use-cases/school/SchoolStudentUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';
import { prismaRead } from '../../../src/infrastructure/database/dbRouter';

const p = prisma as any;
const read = prismaRead as jest.Mock;
const student = (over: any = {}) => ({ id: 'su1', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1', ...over });
const PAST = new Date(Date.now() - 1e7);
const FUTURE = new Date(Date.now() + 1e7);

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(student());
});

describe('ListStudentAssignments — isOpen/resultVisible dalları + filtreler', () => {
  it('sınıfı yok → boş liste', async () => {
    p.schoolUser.findFirst.mockResolvedValue(student({ classroomId: null }));
    const r = await new Stu.ListStudentAssignmentsUseCase().execute({}, 'su1');
    expect(r).toEqual({ items: [] });
  });
  it('açık/kapalı/süresi-geçmiş + teslim edilmiş (skor görünür) + filtre', async () => {
    p.schoolAssignment.findMany.mockResolvedValue([
      { id: 'a1', title: 'Açık', dueDate: FUTURE, availableFrom: PAST, allowLateSubmit: false, status: 'ACTIVE', showResultAfter: 'SUBMIT', resultsReleased: false,
        exam: { title: 'T', examType: 'TEST', durationMinutes: 30 },
        submissions: [{ id: 's1', status: 'GRADED', totalScore: 8, maxScore: 10 }] }, // submitted + SUBMIT → skor görünür (55,56)
      { id: 'a2', title: 'Kapalı', dueDate: FUTURE, availableFrom: PAST, allowLateSubmit: false, status: 'CLOSED', showResultAfter: 'SUBMIT', resultsReleased: false,
        exam: { title: 'T2', examType: 'WRITTEN', durationMinutes: null }, submissions: [] }, // CLOSED → isOpen false (12)
      { id: 'a3', title: 'GecmisSure', dueDate: PAST, availableFrom: PAST, allowLateSubmit: false, status: 'ACTIVE', showResultAfter: 'DUE_DATE', resultsReleased: false,
        exam: { title: 'T3', examType: 'TEST', durationMinutes: 10 }, submissions: [] }, // dueDate geçti, late yok → isOpen false (15)
      { id: 'a4', title: 'Gelecek', dueDate: FUTURE, availableFrom: FUTURE, allowLateSubmit: false, status: 'ACTIVE', showResultAfter: 'SUBMIT', resultsReleased: false,
        exam: { title: 'T4', examType: 'TEST', durationMinutes: 10 }, submissions: [] }, // availableFrom gelecek → isOpen false (14)
      { id: 'a5', title: 'TeslimGizli', dueDate: FUTURE, availableFrom: PAST, allowLateSubmit: false, status: 'ACTIVE', showResultAfter: 'TEACHER_RELEASE', resultsReleased: false,
        exam: { title: 'T5', examType: 'TEST', durationMinutes: 10 }, submissions: [{ id: 's5', status: 'GRADED', totalScore: 5, maxScore: 10 }] }, // teslim ama sonuç gizli → score null (55/56 false)
      { id: 'a6', title: 'BilinmeyenKural', dueDate: FUTURE, availableFrom: PAST, allowLateSubmit: false, status: 'ACTIVE', showResultAfter: 'UNKNOWN', resultsReleased: true,
        exam: { title: 'T6', examType: 'TEST', durationMinutes: 10 }, submissions: [{ id: 's6', status: 'GRADED', totalScore: 5, maxScore: 10 }] }, // bilinmeyen kural → resultVisible son `return false` (25)
      { id: 'a7', title: 'YaziliTeslim', dueDate: FUTURE, availableFrom: PAST, allowLateSubmit: false, status: 'ACTIVE', showResultAfter: 'SUBMIT', resultsReleased: false,
        exam: { title: 'T7', examType: 'WRITTEN', durationMinutes: null }, submissions: [{ id: 's7', status: 'SUBMITTED', totalScore: null, maxScore: null }] }, // görünür ama skor null → ?? null (55/56)
    ]);
    const all = await new Stu.ListStudentAssignmentsUseCase().execute({ filter: 'all' }, 'su1');
    expect(all.items.find((i: any) => i.id === 'a1')!.score).toBe(8);
    expect(all.items.find((i: any) => i.id === 'a4')!.open).toBe(false); // availableFrom gelecek
    expect(all.items.find((i: any) => i.id === 'a5')!.score).toBeNull();  // sonuç gizli → null
    expect(all.items.find((i: any) => i.id === 'a2')!.open).toBe(false);
    expect(all.items.find((i: any) => i.id === 'a3')!.open).toBe(false);
    const pending = await new Stu.ListStudentAssignmentsUseCase().execute({ filter: 'pending' }, 'su1');
    expect(pending.items.every((i: any) => !i.submitted)).toBe(true);
    const submitted = await new Stu.ListStudentAssignmentsUseCase().execute({ filter: 'submitted' }, 'su1');
    expect(submitted.items.every((i: any) => i.submitted)).toBe(true);
  });
});

describe('GetStudentAssignment — classroom yok / not-found / WRITTEN vs TEST', () => {
  it('sınıfsız öğrenci + ödev yok → ASSIGNMENT_NOT_FOUND (?? __none__)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(student({ classroomId: null }));
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new Stu.GetStudentAssignmentUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
    expect(p.schoolAssignment.findFirst.mock.calls[0][0].where.classroomId).toBe('__none__');
  });
  it('WRITTEN: şık [] + resume cevapları', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({
      id: 'a1', title: 'Y', examId: 'ex1', dueDate: FUTURE, availableFrom: PAST, allowLateSubmit: false, status: 'ACTIVE',
      exam: { examType: 'WRITTEN', durationMinutes: null, questions: [{ id: 'q1', content: 'S', mediaUrl: null, points: 1, options: [] }] },
    });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'IN_PROGRESS', answers: [{ questionId: 'q1', selectedOptionId: null, textAnswer: 'cevap', imageUrls: ['u1'] }] });
    const r = await new Stu.GetStudentAssignmentUseCase().execute('a1', 'su1');
    expect(r.questions[0].options).toEqual([]);
    expect(r.questions[0].textAnswer).toBe('cevap');
  });
  it('TEST: şıklar (isCorrect sızmaz) + cevapsız soru fallback', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({
      id: 'a1', title: 'T', examId: 'ex1', dueDate: FUTURE, availableFrom: PAST, allowLateSubmit: false, status: 'ACTIVE',
      exam: { examType: 'TEST', durationMinutes: 30, questions: [{ id: 'q1', content: 'S', mediaUrl: null, points: 1, options: [{ id: 'o1', content: 'A' }, { id: 'o2', content: 'B' }] }] },
    });
    p.schoolSubmission.findUnique.mockResolvedValue(null); // teslim yok → answerByQ boş, fallback null
    const r = await new Stu.GetStudentAssignmentUseCase().execute('a1', 'su1');
    expect(r.questions[0].options).toHaveLength(2);
    expect(JSON.stringify(r.questions[0].options)).not.toContain('isCorrect');
    expect(r.questions[0].selectedOptionId).toBeNull();
  });
});

describe('StartSubmission — closed/resume/already', () => {
  it('kapalı ödev → ASSIGNMENT_CLOSED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'CLOSED', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false });
    await expect(new Stu.StartSubmissionUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ASSIGNMENT_CLOSED' });
  });
  it('mevcut IN_PROGRESS → resumed', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'IN_PROGRESS' });
    const r = await new Stu.StartSubmissionUseCase().execute('a1', 'su1');
    expect(r).toEqual({ submissionId: 'sub1', resumed: true });
  });
  it('mevcut teslim → ALREADY_SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'GRADED' });
    await expect(new Stu.StartSubmissionUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });
  it('yeni → created', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false });
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    const r = await new Stu.StartSubmissionUseCase().execute('a1', 'su1');
    expect(r).toEqual({ submissionId: 'sub1', resumed: false });
  });
  it('sınıfsız öğrenci + ödev yok → getOpenSubmission __none__ + ASSIGNMENT_NOT_FOUND', async () => {
    p.schoolUser.findFirst.mockResolvedValue(student({ classroomId: null }));
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new Stu.StartSubmissionUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
    expect(p.schoolAssignment.findFirst.mock.calls[0][0].where.classroomId).toBe('__none__');
  });
});

describe('SaveAnswer — not-started/submitted/question-required/image+text', () => {
  const openAsg = { id: 'a1', status: 'ACTIVE', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false };
  it('başlatılmamış → NOT_STARTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(openAsg);
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    await expect(new Stu.SaveAnswerUseCase().execute('a1', { questionId: 'q1' }, 'su1')).rejects.toMatchObject({ code: 'NOT_STARTED' });
  });
  it('teslim edilmiş → ALREADY_SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(openAsg);
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'GRADED' });
    await expect(new Stu.SaveAnswerUseCase().execute('a1', { questionId: 'q1' }, 'su1')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });
  it('questionId yok → QUESTION_REQUIRED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(openAsg);
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'IN_PROGRESS' });
    await expect(new Stu.SaveAnswerUseCase().execute('a1', { questionId: '' }, 'su1')).rejects.toMatchObject({ code: 'QUESTION_REQUIRED' });
  });
  it('görsel + metin (trim) kaydı; >5 görsel kırpılır', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(openAsg);
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'IN_PROGRESS' });
    await new Stu.SaveAnswerUseCase().execute('a1', { questionId: 'q1', textAnswer: '  yanit  ', imageUrls: ['a', 'b', 'c', 'd', 'e', 'f', '  '] }, 'su1');
    const create = p.schoolSubmissionAnswer.upsert.mock.calls[0][0].create;
    expect(create.textAnswer).toBe('yanit');
    expect(create.imageUrls).toHaveLength(5);
  });
  it('görsel undefined / metin boş → []/null', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(openAsg);
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'IN_PROGRESS' });
    await new Stu.SaveAnswerUseCase().execute('a1', { questionId: 'q1', selectedOptionId: 'o1' }, 'su1');
    const create = p.schoolSubmissionAnswer.upsert.mock.calls[0][0].create;
    expect(create.imageUrls).toEqual([]);
    expect(create.textAnswer).toBeNull();
  });
});

describe('SubmitAssignment — not-found/closed/not-started + TEST/WRITTEN puanlama', () => {
  it('ödev yok → ASSIGNMENT_NOT_FOUND', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new Stu.SubmitAssignmentUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });
  it('sınıfsız öğrenci → classroomId __none__ (163)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(student({ classroomId: null }));
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new Stu.SubmitAssignmentUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
    expect(p.schoolAssignment.findFirst.mock.calls[0][0].where.classroomId).toBe('__none__');
  });
  it('kapalı → ASSIGNMENT_CLOSED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'CLOSED', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false, exam: { examType: 'TEST', questions: [] } });
    await expect(new Stu.SubmitAssignmentUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ASSIGNMENT_CLOSED' });
  });
  it('başlatılmamış → NOT_STARTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false, exam: { examType: 'TEST', questions: [] } });
    p.schoolSubmission.findUnique.mockResolvedValue(null);
    await expect(new Stu.SubmitAssignmentUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'NOT_STARTED' });
  });
  it('zaten teslim → ALREADY_SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', status: 'ACTIVE', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false, exam: { examType: 'TEST', questions: [] } });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'GRADED', answers: [] });
    await expect(new Stu.SubmitAssignmentUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
  });
  it('TEST: cevaplı (doğru) + cevapsız soru → otomatik puanlama', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({
      id: 'a1', status: 'ACTIVE', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false,
      exam: { examType: 'TEST', questions: [
        { id: 'q1', points: 2, options: [{ id: 'o1', isCorrect: true }, { id: 'o2', isCorrect: false }] },
        { id: 'q2', points: 3, options: [{ id: 'o3', isCorrect: true }] }, // cevapsız
      ] },
    });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'IN_PROGRESS', answers: [{ id: 'ans1', questionId: 'q1', selectedOptionId: 'o1' }] });
    const r = await new Stu.SubmitAssignmentUseCase().execute('a1', 'su1');
    expect(r).toMatchObject({ status: 'GRADED', totalScore: 2, maxScore: 5 });
  });
  it('WRITTEN: maxScore toplanır, puansız SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({
      id: 'a1', status: 'ACTIVE', availableFrom: PAST, dueDate: FUTURE, allowLateSubmit: false,
      exam: { examType: 'WRITTEN', questions: [{ id: 'q1', points: 5, options: [] }] },
    });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'IN_PROGRESS', answers: [] });
    const r = await new Stu.SubmitAssignmentUseCase().execute('a1', 'su1');
    expect(r).toMatchObject({ status: 'SUBMITTED', totalScore: null, maxScore: 5 });
  });
});

describe('GetStudentResult — not-found/not-submitted/not-visible + TEST/WRITTEN', () => {
  const exam = (examType: string) => ({ examType, questions: [{ id: 'q1', content: 'S', points: 2, solutionText: 'çöz', options: [{ id: 'o1', content: 'A', isCorrect: true }, { id: 'o2', content: 'B', isCorrect: false }] }] });
  it('ödev yok → ASSIGNMENT_NOT_FOUND', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new Stu.GetStudentResultUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
  });
  it('teslim edilmemiş → NOT_SUBMITTED', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', showResultAfter: 'SUBMIT', dueDate: FUTURE, resultsReleased: false, exam: exam('TEST') });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'IN_PROGRESS', answers: [] });
    await expect(new Stu.GetStudentResultUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'NOT_SUBMITTED' });
  });
  it('sonuç gizli (TEACHER_RELEASE, yayımlanmadı) → visible:false', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', showResultAfter: 'TEACHER_RELEASE', dueDate: FUTURE, resultsReleased: false, exam: exam('TEST') });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'GRADED', answers: [] });
    const r = await new Stu.GetStudentResultUseCase().execute('a1', 'su1');
    expect(r).toMatchObject({ visible: false, reason: 'TEACHER_RELEASE' });
  });
  it('TEST görünür: şık+isCorrect+earned; cevapsız fallback', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', showResultAfter: 'SUBMIT', dueDate: FUTURE, resultsReleased: false, exam: exam('TEST') });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'GRADED', totalScore: 2, maxScore: 2, feedback: null, answers: [{ questionId: 'q1', selectedOptionId: 'o1', isCorrect: true, earnedPoints: 2 }] });
    const r: any = await new Stu.GetStudentResultUseCase().execute('a1', 'su1');
    expect(r.visible).toBe(true);
    expect(r.questions[0].isCorrect).toBe(true);
  });
  it('TEST görünür: cevapsız soru → ans?.x ?? null fallback (250-252)', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', showResultAfter: 'SUBMIT', dueDate: FUTURE, resultsReleased: false, exam: exam('TEST') });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'GRADED', totalScore: 0, maxScore: 2, feedback: null, answers: [] }); // ans undefined
    const r: any = await new Stu.GetStudentResultUseCase().execute('a1', 'su1');
    expect(r.questions[0].selectedOptionId).toBeNull();
    expect(r.questions[0].isCorrect).toBeNull();
    expect(r.questions[0].earnedPoints).toBeNull();
  });
  it('sınıfsız öğrenci → ASSIGNMENT_NOT_FOUND (?? __none__ 220)', async () => {
    p.schoolUser.findFirst.mockResolvedValue(student({ classroomId: null }));
    p.schoolAssignment.findFirst.mockResolvedValue(null);
    await expect(new Stu.GetStudentResultUseCase().execute('a1', 'su1')).rejects.toMatchObject({ code: 'ASSIGNMENT_NOT_FOUND' });
    expect(p.schoolAssignment.findFirst.mock.calls[0][0].where.classroomId).toBe('__none__');
  });
  it('WRITTEN görünür: textAnswer/imageUrls/earnedPoints fallback', async () => {
    p.schoolAssignment.findFirst.mockResolvedValue({ id: 'a1', showResultAfter: 'DUE_DATE', dueDate: PAST, resultsReleased: false, exam: exam('WRITTEN') });
    p.schoolSubmission.findUnique.mockResolvedValue({ id: 'sub1', status: 'SUBMITTED', totalScore: null, maxScore: 2, feedback: 'iyi', answers: [] }); // cevapsız → fallback null/[]
    const r: any = await new Stu.GetStudentResultUseCase().execute('a1', 'su1');
    expect(r.questions[0].textAnswer).toBeNull();
    expect(r.questions[0].imageUrls).toEqual([]);
  });
});

describe('GetStudentReport — tarih/null/Zümresiz/Konusuz/zaman serisi', () => {
  it('sınıfsız + boş teslim → level null, özet null', async () => {
    p.schoolUser.findFirst.mockResolvedValue(student({ classroomId: null }));
    read.mockReturnValue({ schoolSubmission: { findMany: jest.fn().mockResolvedValue([]) }, classroom: { findUnique: jest.fn() } });
    const r = await new Stu.GetStudentReportUseCase().execute('su1', {});
    expect(r.level).toBeNull();
    expect(r.summary.avgPercent).toBeNull();
  });
  it('input parametresiz çağrı (default {}) + sınıf bulunamadı → gradeLevel null (286)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    read.mockReturnValue({ schoolSubmission: { findMany }, classroom: { findUnique: jest.fn().mockResolvedValue(null) } }); // classroomId var ama cls null
    const r = await new Stu.GetStudentReportUseCase().execute('su1'); // input verilmedi → default {}
    expect(r.level).toBeNull();
    expect(findMany.mock.calls[0][0].where.submittedAt).toBeUndefined();
  });
  it('sınıflı + tarih aralığı + null skor + Zümresiz/Konusuz + çok gün', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { totalScore: 8, maxScore: 10, _count: { answers: 1 }, submittedAt: new Date('2026-03-03'), assignment: { exam: { topic: 'Cebir', department: { name: 'Mat' } } } },
      { totalScore: null, maxScore: 10, _count: { answers: 1 }, submittedAt: new Date('2026-03-01'), assignment: { exam: { topic: 'Cebir', department: { name: 'Mat' } } } }, // null skor → atla
      { totalScore: 6, maxScore: 10, _count: { answers: 1 }, submittedAt: new Date('2026-03-02'), assignment: { exam: { topic: '  ', department: null } } }, // Zümresiz + Konusuz
      { totalScore: 4, maxScore: 10, _count: { answers: 1 }, submittedAt: null, assignment: { exam: { topic: 'Geo', department: { name: 'Mat' } } } }, // null gün → dayAgg atla
    ]);
    read.mockReturnValue({ schoolSubmission: { findMany }, classroom: { findUnique: jest.fn().mockResolvedValue({ gradeLevel: 5 }) } });
    const r = await new Stu.GetStudentReportUseCase().execute('su1', { from: '2026-01-01', to: '2026-06-01' });
    expect(r.level).toBe(5);
    expect(r.bySubject.map((x: any) => x.name)).toEqual(expect.arrayContaining(['Mat', 'Zümresiz']));
    expect(r.byTopic.map((x: any) => x.name)).toEqual(expect.arrayContaining(['Cebir', 'Konusuz', 'Geo']));
    expect(r.timeseries.map((t: any) => t.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']); // submittedAt olan 3 gün (puansız teslim de hacme sayılır); null gün hariç
    expect(read().schoolSubmission.findMany.mock.calls[0][0].where.submittedAt).toMatchObject({ gte: expect.any(Date), lte: expect.any(Date) });
  });
  it('tarih: yalnız from / yalnız to / geçersiz', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    read.mockReturnValue({ schoolSubmission: { findMany }, classroom: { findUnique: jest.fn() } });
    p.schoolUser.findFirst.mockResolvedValue(student({ classroomId: null }));
    await new Stu.GetStudentReportUseCase().execute('su1', { from: '2026-01-01' });
    expect(findMany.mock.calls[0][0].where.submittedAt).toMatchObject({ gte: expect.any(Date) });
    findMany.mockClear();
    await new Stu.GetStudentReportUseCase().execute('su1', { to: '2026-06-01' });
    expect(findMany.mock.calls[0][0].where.submittedAt).toMatchObject({ lte: expect.any(Date) });
    findMany.mockClear();
    await new Stu.GetStudentReportUseCase().execute('su1', { from: 'x', to: 'y' });
    expect(findMany.mock.calls[0][0].where.submittedAt).toBeUndefined();
  });
});
