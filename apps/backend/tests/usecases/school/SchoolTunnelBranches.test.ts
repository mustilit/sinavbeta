/**
 * E-Sınıf SchoolTunnel — branch (dal) kapsamı (saf motor + tunnelPlay gerçek).
 * loadSchoolPlayData EXAM_NOT_FOUND + ?? fallbacks, buildState (completed/invalid JSON/boş),
 * Submit hata dalları (ATTEMPT_NOT_FOUND/DONE/NO_CURRENT/QUESTION_GONE) + no-pick completion.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolExam: { findUnique: jest.fn() },
    schoolTunnelAttempt: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    schoolTunnelProgress: { findMany: jest.fn(async () => []), upsert: jest.fn(async () => ({})) },
  },
}));

import {
  StartSchoolTunnelUseCase, GetSchoolTunnelStateUseCase, SubmitSchoolTunnelAnswerUseCase,
} from '../../../src/application/use-cases/school/SchoolTunnelAttemptUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const student = { id: 'su1', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1' };
const opts5 = (correctId: string | null) => ['o1', 'o2', 'o3', 'o4', 'o5'].map((id) => ({ id, content: id.toUpperCase(), mediaUrl: null, isCorrect: id === correctId }));
const tunnelExam = (over: any = {}) => ({
  id: 'ex1', title: 'Tünel', schoolId: 'sch1', examType: 'TUNNEL', layerCount: 1, optionsPerQuestion: 5, advanceStreak: 2,
  questions: [{ id: 'q1', layerIndex: 1, content: 'Soru', mediaUrl: null, options: opts5('o1') }],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(student);
  p.schoolExam.findUnique.mockResolvedValue(tunnelExam());
  p.schoolTunnelProgress.findMany.mockResolvedValue([]);
  p.schoolTunnelAttempt.update.mockImplementation(async ({ data }: any) => ({
    id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS',
    currentQuestionId: null, currentCorrectPosition: null, currentOrderJson: null, ...data,
  }));
});

describe('loadSchoolPlayData / Start — ?? fallbacks', () => {
  it('sınav yok → EXAM_NOT_FOUND', async () => {
    p.schoolExam.findUnique.mockResolvedValue(null);
    await expect(new StartSchoolTunnelUseCase().execute('exX', 'su1')).rejects.toMatchObject({ code: 'EXAM_NOT_FOUND' });
  });
  it('doğru şık yok + layerIndex null → fallback (correctOptionId=ilk, layer=1)', async () => {
    p.schoolExam.findUnique.mockResolvedValue(tunnelExam({
      questions: [{ id: 'q1', layerIndex: null, content: 'S', mediaUrl: 'img.png', options: opts5(null) }], // hiç isCorrect yok
    }));
    p.schoolTunnelAttempt.findUnique.mockResolvedValue(null);
    p.schoolTunnelAttempt.create.mockResolvedValue({ id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS', currentQuestionId: null });
    const r = await new StartSchoolTunnelUseCase().execute('ex1', 'su1');
    expect(r.currentQuestion.id).toBe('q1');
  });
  it('exam config alanları yok → ?? varsayılanlar (layerCount/optionsPerQuestion/advanceStreak)', async () => {
    p.schoolExam.findUnique.mockResolvedValue({
      id: 'ex1', title: 'T', schoolId: 'sch1', examType: 'TUNNEL', // layerCount/optionsPerQuestion/advanceStreak YOK
      questions: [{ id: 'q1', layerIndex: 1, content: 'S', mediaUrl: null, options: opts5('o1') }],
    });
    p.schoolTunnelAttempt.findUnique.mockResolvedValue(null);
    p.schoolTunnelAttempt.create.mockResolvedValue({ id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS', currentQuestionId: null });
    const r = await new StartSchoolTunnelUseCase().execute('ex1', 'su1');
    expect(r.currentQuestion.id).toBe('q1');
  });
  it('boş sorulu tünel → pick null → COMPLETED + progressPercent 0', async () => {
    p.schoolExam.findUnique.mockResolvedValue(tunnelExam({ questions: [] }));
    p.schoolTunnelAttempt.findUnique.mockResolvedValue(null);
    p.schoolTunnelAttempt.create.mockResolvedValue({ id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS', currentQuestionId: null });
    const r = await new StartSchoolTunnelUseCase().execute('ex1', 'su1');
    expect(r.status).toBe('COMPLETED');
    expect(r.progressPercent).toBe(0);
  });
});

describe('buildSchoolAttemptState — completed / invalid JSON', () => {
  it('COMPLETED deneme → currentQuestion null (ensureCurrentQuestion erken dönüş)', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({ id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'COMPLETED', currentQuestionId: null, currentOrderJson: null });
    const r = await new GetSchoolTunnelStateUseCase().execute('ex1', 'su1');
    expect(r.status).toBe('COMPLETED');
    expect(r.currentQuestion).toBeNull();
  });
  it('geçersiz currentOrderJson → catch ile meta sırasına düşer; bilinmeyen id → "" fallback', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({
      id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS',
      currentQuestionId: 'q1', currentCorrectPosition: 1, currentOrderJson: 'GECERSIZ-JSON',
    });
    const r = await new GetSchoolTunnelStateUseCase().execute('ex1', 'su1');
    expect(r.currentQuestion.id).toBe('q1');
    expect(r.currentQuestion.options).toHaveLength(5);
  });
  it('orderJson bilinmeyen id içerir → content "" fallback', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({
      id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS',
      currentQuestionId: 'q1', currentCorrectPosition: 1, currentOrderJson: JSON.stringify(['zzz', 'o1']),
    });
    const r = await new GetSchoolTunnelStateUseCase().execute('ex1', 'su1');
    const zzz = r.currentQuestion.options.find((o: any) => o.id === 'zzz');
    expect(zzz.content).toBe('');
  });
});

describe('SubmitSchoolTunnelAnswer — hata dalları + no-pick completion', () => {
  it('deneme yok → ATTEMPT_NOT_FOUND', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue(null);
    await expect(new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'o1', 'su1')).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
  });
  it('tamamlanmış deneme → ATTEMPT_DONE', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({ id: 'a1', status: 'COMPLETED', currentQuestionId: 'q1', currentCorrectPosition: 1 });
    await expect(new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'o1', 'su1')).rejects.toMatchObject({ code: 'ATTEMPT_DONE' });
  });
  it('aktif soru yok → NO_CURRENT_QUESTION', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({ id: 'a1', status: 'IN_PROGRESS', currentQuestionId: null, currentCorrectPosition: null });
    await expect(new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'o1', 'su1')).rejects.toMatchObject({ code: 'NO_CURRENT_QUESTION' });
  });
  it('soru artık yok → QUESTION_GONE', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({ id: 'a1', status: 'IN_PROGRESS', currentQuestionId: 'qX', currentCorrectPosition: 1 });
    await expect(new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'o1', 'su1')).rejects.toMatchObject({ code: 'QUESTION_GONE' });
  });
  it('layer içinde ilk soru ustalaşır + sonraki maskesiz (masks.get ?? 0 b1)', async () => {
    p.schoolExam.findUnique.mockResolvedValue(tunnelExam({
      layerCount: 2,
      questions: [
        { id: 'q1', layerIndex: 1, content: 'Q1', mediaUrl: null, options: opts5('o1') },
        { id: 'q2', layerIndex: 1, content: 'Q2', mediaUrl: null, options: opts5('o1') }, // maskesiz → layerMastered'da ?? 0
      ],
    }));
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({
      id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS',
      currentQuestionId: 'q1', currentCorrectPosition: 3, currentOrderJson: JSON.stringify(['o1', 'o2', 'o3', 'o4', 'o5']),
    });
    p.schoolTunnelProgress.findMany.mockResolvedValue([{ questionId: 'q1', correctMask: 0b011 }]); // q1 zaten 2 pozisyon → 3. ile ustalaşır
    const r = await new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'o1', 'su1');
    expect(r.correct).toBe(true);
    expect(r.completed).toBe(false); // q1 ustalaştı ama q2 kaldı → q2 sunulur
  });
  it('çok katmanlı: doğru cevap sonrası bir sonraki soru sunulur (tamamlanmaz)', async () => {
    p.schoolExam.findUnique.mockResolvedValue(tunnelExam({
      layerCount: 2,
      questions: [
        { id: 'q1', layerIndex: 1, content: 'Q1', mediaUrl: null, options: opts5('o1') },
        { id: 'q2', layerIndex: 1, content: 'Q2', mediaUrl: null, options: opts5('o1') },
      ],
    }));
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({
      id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS',
      currentQuestionId: 'q1', currentCorrectPosition: 1, currentOrderJson: JSON.stringify(['o1', 'o2', 'o3', 'o4', 'o5']),
    });
    p.schoolTunnelProgress.findMany.mockResolvedValue([]);
    const r = await new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'o1', 'su1');
    expect(r.correct).toBe(true);
    expect(r.completed).toBe(false); // q2 sunulur
  });
});
