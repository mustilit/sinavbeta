/**
 * E-Sınıf canlı oturum — host (liste/state/start/advance/end) + öğrenci (state/answer).
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolLevel: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    classroom: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    department: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    school: { update: jest.fn(), findUnique: jest.fn() },
    liveSession: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    liveQuestion: { count: jest.fn() },
    liveAnswer: { groupBy: jest.fn(async () => []), findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    liveParticipant: { findUnique: jest.fn(), upsert: jest.fn(), count: jest.fn(async () => 0), updateMany: jest.fn() },
    liveOption: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import {
  ListSchoolLiveSessionsUseCase, GetSchoolLiveHostStateUseCase,
  StartSchoolLiveSessionUseCase, AdvanceSchoolLiveSessionUseCase, EndSchoolLiveSessionUseCase,
  PrevSchoolLiveSessionUseCase, ToggleSchoolLiveStatsUseCase, PingSchoolLiveSessionUseCase,
  GetSchoolLiveParticipantStateUseCase, SubmitSchoolLiveAnswerUseCase,
} from '../../../src/application/use-cases/school/SchoolLiveUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const teacher = { id: 'su1', schoolId: 'sch1', schoolRole: 'TEACHER', branchId: null, departmentId: 'd1', classroomId: null };
const student = { id: 'su2', schoolId: 'sch1', schoolRole: 'STUDENT', branchId: null, departmentId: null, classroomId: 'c1' };

beforeEach(() => jest.clearAllMocks());

describe('Host akışı', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(teacher));

  it('List: öğretmenin oturumları', async () => {
    p.liveSession.findMany.mockResolvedValue([{ id: 's1', title: 'T', joinCode: '123456', status: 'DRAFT', currentQuestionIdx: 0, _count: { questions: 3, participants: 2 }, createdAt: new Date() }]);
    const r = await new ListSchoolLiveSessionsUseCase().execute('u1');
    expect(r[0]).toMatchObject({ id: 's1', questionCount: 3, participantCount: 2 });
  });

  it('HostState: güncel soru dağılımı (stats[qid]) + currentQuestion', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', title: 'T', joinCode: '123456', status: 'ACTIVE', showStats: false, currentQuestionIdx: 0, _count: { participants: 2 }, questions: [{ id: 'q1', content: 'S1', mediaUrl: null, options: [{ id: 'o1', content: 'A', mediaUrl: null, isCorrect: true }] }] });
    p.liveAnswer.groupBy.mockResolvedValue([{ optionId: 'o1', _count: { _all: 2 } }]);
    p.liveParticipant.count.mockResolvedValue(1);
    const r = await new GetSchoolLiveHostStateUseCase().execute('s1', 'u1');
    expect(r.stats['q1']).toEqual([{ optionId: 'o1', content: 'A', isCorrect: true, count: 2 }]);
    expect(r.currentQuestion.options[0]).toMatchObject({ isCorrect: true });
    expect(r).toMatchObject({ totalQuestions: 1, participantCount: 2, activeParticipantCount: 1 });
  });
  it('HostState: oturum yoksa SESSION_NOT_FOUND', async () => {
    p.liveSession.findFirst.mockResolvedValue(null);
    await expect(new GetSchoolLiveHostStateUseCase().execute('x', 'u1')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('Start: ACTIVE yapar', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1' });
    p.liveSession.update.mockResolvedValue({});
    const r = await new StartSchoolLiveSessionUseCase().execute('s1', 'u1');
    expect(r).toEqual({ ok: true });
  });

  it('Advance: sonraki soruya geçer (sınır)', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', currentQuestionIdx: 0 });
    p.liveQuestion.count.mockResolvedValue(3);
    p.liveSession.update.mockResolvedValue({});
    const r = await new AdvanceSchoolLiveSessionUseCase().execute('s1', 'u1');
    expect(r).toEqual({ currentQuestionIdx: 1 });
  });

  it('Prev: önceki soruya döner (0 altına inmez)', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', currentQuestionIdx: 0 });
    p.liveSession.update.mockResolvedValue({});
    const r = await new PrevSchoolLiveSessionUseCase().execute('s1', 'u1');
    expect(r).toEqual({ currentQuestionIdx: 0 });
  });

  it('ToggleStats: showStats tersine çevrilir', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', showStats: false });
    p.liveSession.update.mockResolvedValue({ showStats: true });
    const r = await new ToggleSchoolLiveStatsUseCase().execute('s1', 'u1');
    expect(r).toEqual({ showStats: true });
  });

  it('End: bitirir + kota artar', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', status: 'ACTIVE' });
    p.$transaction.mockResolvedValue([{}, {}]);
    const r = await new EndSchoolLiveSessionUseCase().execute('s1', 'u1');
    expect(r).toEqual({ ok: true });
  });
  it('End: zaten bitmişse alreadyEnded', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', status: 'ENDED' });
    const r = await new EndSchoolLiveSessionUseCase().execute('s1', 'u1');
    expect(r).toMatchObject({ alreadyEnded: true });
  });
});

describe('Öğrenci akışı', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(student));

  it('ParticipantState (ACTIVE): doğru sızmaz + kendi cevabı (myAnswer)', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', title: 'T', status: 'ACTIVE', showStats: false, currentQuestionIdx: 0, _count: { participants: 3 }, questions: [{ id: 'q1', content: 'S1', mediaUrl: null, options: [{ id: 'o1', content: 'A', mediaUrl: null, isCorrect: true }, { id: 'o2', content: 'B', mediaUrl: null, isCorrect: false }] }] });
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pp1' });
    p.liveAnswer.findUnique.mockResolvedValue({ optionId: 'o1' });
    const r = await new GetSchoolLiveParticipantStateUseCase().execute('s1', 'u2');
    expect(r.status).toBe('ACTIVE');
    expect(r.myAnswer).toBe('o1');
    expect(r).toMatchObject({ totalQuestions: 1, participantCount: 3, currentQuestionIdx: 0 });
    expect(JSON.stringify(r.currentQuestion)).not.toContain('isCorrect');
  });
  it('ParticipantState (ACTIVE + showStats): stats[qid] gelir (doğru yeşil için isCorrect dahil)', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', title: 'T', status: 'ACTIVE', showStats: true, currentQuestionIdx: 0, _count: { participants: 3 }, questions: [{ id: 'q1', content: 'S1', mediaUrl: null, options: [{ id: 'o1', content: 'A', mediaUrl: null, isCorrect: true }] }] });
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pp1' });
    p.liveAnswer.findUnique.mockResolvedValue(null);
    p.liveAnswer.groupBy.mockResolvedValue([{ optionId: 'o1', _count: { _all: 2 } }]);
    const r = await new GetSchoolLiveParticipantStateUseCase().execute('s1', 'u2');
    expect(r.stats['q1']).toEqual([{ optionId: 'o1', content: 'A', isCorrect: true, count: 2 }]);
  });
  it('ParticipantState (ENDED): myResults skor + soru detayı döner', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', title: 'T', status: 'ENDED', currentQuestionIdx: 0, _count: { participants: 2 }, questions: [{ id: 'q1', content: 'S1', options: [{ id: 'o1', content: 'A', isCorrect: true }] }, { id: 'q2', content: 'S2', options: [{ id: 'o3', content: 'C', isCorrect: true }] }] });
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pp1' });
    p.liveAnswer.findMany.mockResolvedValue([
      { questionId: 'q1', optionId: 'o1', option: { id: 'o1', content: 'A', isCorrect: true } },
      { questionId: 'q2', optionId: 'o4', option: { id: 'o4', content: 'D', isCorrect: false } },
    ]);
    const r = await new GetSchoolLiveParticipantStateUseCase().execute('s1', 'u2');
    expect(r.status).toBe('ENDED');
    expect(r.myResults).toMatchObject({ correct: 1, total: 2 });
    expect(r.myResults.answers[0]).toMatchObject({ questionId: 'q1', isCorrect: true, chosenOptionContent: 'A', correctOptionContent: 'A' });
    expect(r.myResults.answers[1]).toMatchObject({ questionId: 'q2', isCorrect: false, chosenOptionContent: 'D', correctOptionContent: 'C' });
  });
  it('ParticipantState: katılmadıysa NOT_JOINED', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', title: 'T', status: 'ACTIVE', showStats: false, currentQuestionIdx: 0, _count: { participants: 0 }, questions: [] });
    p.liveParticipant.findUnique.mockResolvedValue(null);
    await expect(new GetSchoolLiveParticipantStateUseCase().execute('s1', 'u2')).rejects.toMatchObject({ code: 'NOT_JOINED' });
  });
  it('Ping: kendi katılımının lastSeenAt günceller', async () => {
    p.liveParticipant.updateMany.mockResolvedValue({ count: 1 });
    const r = await new PingSchoolLiveSessionUseCase().execute('s1', 'u2');
    expect(r).toEqual({ ok: true });
    expect(p.liveParticipant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionId: 's1', userId: 'u2' } }));
  });

  it('SubmitAnswer: aktif değilse NOT_ACTIVE', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', status: 'DRAFT', currentQuestionIdx: 0, questions: [{ id: 'q1' }] });
    await expect(new SubmitSchoolLiveAnswerUseCase().execute('s1', { questionId: 'q1', optionId: 'o1' }, 'u2')).rejects.toMatchObject({ code: 'NOT_ACTIVE' });
  });
  it('SubmitAnswer: güncel soru değilse NOT_CURRENT_QUESTION', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', status: 'ACTIVE', currentQuestionIdx: 0, questions: [{ id: 'q1' }, { id: 'q2' }] });
    await expect(new SubmitSchoolLiveAnswerUseCase().execute('s1', { questionId: 'q2', optionId: 'o1' }, 'u2')).rejects.toMatchObject({ code: 'NOT_CURRENT_QUESTION' });
  });
  it('SubmitAnswer: başarı', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 's1', status: 'ACTIVE', currentQuestionIdx: 0, questions: [{ id: 'q1' }] });
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pp1' });
    p.liveOption.findFirst.mockResolvedValue({ id: 'o1' });
    p.liveAnswer.upsert.mockResolvedValue({});
    const r = await new SubmitSchoolLiveAnswerUseCase().execute('s1', { questionId: 'q1', optionId: 'o1' }, 'u2');
    expect(r).toEqual({ ok: true });
  });
});
