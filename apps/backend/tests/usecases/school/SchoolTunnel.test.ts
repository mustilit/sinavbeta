/**
 * E-Sınıf tünel adaptif çözme — start (deneme + ilk soru), submit (ustalık ilerleme),
 * erişim (öğrenci-dışı / tünel-dışı / çapraz okul). Saf motor (engine.ts) gerçek.
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
const opts = (correctId: string) => ['o1', 'o2', 'o3', 'o4', 'o5'].map((id) => ({ id, content: id.toUpperCase(), mediaUrl: null, isCorrect: id === correctId }));
const tunnelExam = (over: any = {}) => ({
  id: 'ex1', title: 'Tünel', schoolId: 'sch1', examType: 'TUNNEL', layerCount: 1, optionsPerQuestion: 5, advanceStreak: 2,
  questions: [{ id: 'q1', layerIndex: 1, content: 'Soru', mediaUrl: null, options: opts('o1') }],
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

describe('StartSchoolTunnelUseCase', () => {
  it('ilk başlatma: deneme oluşturur + ilk soruyu sunar (doğru sızmaz)', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue(null);
    p.schoolTunnelAttempt.create.mockResolvedValue({ id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS', currentQuestionId: null });
    const r = await new StartSchoolTunnelUseCase().execute('ex1', 'su1');
    expect(r.currentQuestion.id).toBe('q1');
    expect(r.currentQuestion.options).toHaveLength(5);
    expect(r.totalQuestions).toBe(1);
    expect(JSON.stringify(r.currentQuestion)).not.toContain('isCorrect');
  });

  it('öğrenci değilse → FORBIDDEN_SCHOOL_ROLE', async () => {
    p.schoolUser.findFirst.mockResolvedValue({ ...student, schoolRole: 'TEACHER' });
    await expect(new StartSchoolTunnelUseCase().execute('ex1', 'su1')).rejects.toMatchObject({ code: 'FORBIDDEN_SCHOOL_ROLE' });
  });

  it('tünel değilse → NOT_TUNNEL', async () => {
    p.schoolExam.findUnique.mockResolvedValue(tunnelExam({ examType: 'TEST' }));
    await expect(new StartSchoolTunnelUseCase().execute('ex1', 'su1')).rejects.toMatchObject({ code: 'NOT_TUNNEL' });
  });

  it('başka okulun sınavı → CROSS_SCHOOL', async () => {
    p.schoolExam.findUnique.mockResolvedValue(tunnelExam({ schoolId: 'other' }));
    await expect(new StartSchoolTunnelUseCase().execute('ex1', 'su1')).rejects.toMatchObject({ code: 'CROSS_SCHOOL' });
  });
});

describe('SubmitSchoolTunnelAnswerUseCase', () => {
  beforeEach(() => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue({
      id: 'a1', examId: 'ex1', studentId: 'su1', baseLayer: 1, upperOpen: false, streakCount: 0, status: 'IN_PROGRESS',
      currentQuestionId: 'q1', currentCorrectPosition: 1, currentOrderJson: JSON.stringify(['o1', 'o2', 'o3', 'o4', 'o5']),
    });
  });

  it('doğru cevap: progress kaydeder, doğru şıkkı döner, tamamlanmaz (3 pozisyon gerekli)', async () => {
    const r = await new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'o1', 'su1');
    expect(r.correct).toBe(true);
    expect(r.correctOptionId).toBe('o1');
    expect(r.completed).toBe(false);
    expect(p.schoolTunnelProgress.upsert).toHaveBeenCalled();
  });

  it('yanlış cevap: doğru değil + tamamlanmaz', async () => {
    const r = await new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'o2', 'su1');
    expect(r.correct).toBe(false);
    expect(r.completed).toBe(false);
  });

  it('geçersiz şık → INVALID_OPTION', async () => {
    await expect(new SubmitSchoolTunnelAnswerUseCase().execute('ex1', 'zzz', 'su1')).rejects.toMatchObject({ code: 'INVALID_OPTION' });
  });
});

describe('GetSchoolTunnelStateUseCase', () => {
  it('deneme yoksa → ATTEMPT_NOT_FOUND', async () => {
    p.schoolTunnelAttempt.findUnique.mockResolvedValue(null);
    await expect(new GetSchoolTunnelStateUseCase().execute('ex1', 'su1')).rejects.toMatchObject({ code: 'ATTEMPT_NOT_FOUND' });
  });
});
