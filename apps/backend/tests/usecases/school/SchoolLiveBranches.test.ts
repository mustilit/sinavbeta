/**
 * E-Sınıf SchoolLive — branch (dal) kapsamı.
 * Create doğrulama + kota + snapshot, scopedSession not-found, host/participant cur null + stats,
 * join cross-school/ended, submit not-active/not-current/invalid-option, end already-ended.
 */
jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    schoolUser: { findFirst: jest.fn() },
    schoolLevel: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    classroom: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    department: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
    school: { findUnique: jest.fn(async () => ({ annualLiveLimit: 0, usedLiveCount: 0 })), update: jest.fn(async () => ({})) },
    liveSession: { findUnique: jest.fn(async () => null), findFirst: jest.fn(), findMany: jest.fn(async () => []), create: jest.fn(async () => ({ id: 'ls1', joinCode: '123456' })), update: jest.fn(async ({ select }: any) => (select ? { showStats: true } : {})), count: jest.fn(async () => 0) },
    liveQuestion: { create: jest.fn(async () => ({ id: 'lq1' })), count: jest.fn(async () => 3) },
    liveOption: { create: jest.fn(), createMany: jest.fn(), findFirst: jest.fn() },
    liveParticipant: { count: jest.fn(async () => 0), findUnique: jest.fn(), upsert: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 1 })) },
    liveAnswer: { groupBy: jest.fn(async () => []), findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null), upsert: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (arg: any) => {
      if (typeof arg === 'function') return arg({
        liveSession: { create: jest.fn(async () => ({ id: 'ls1', joinCode: '123456' })) },
        liveQuestion: { create: jest.fn(async () => ({ id: 'lq1' })) },
        liveOption: { createMany: jest.fn() },
      });
      return Promise.all(arg);
    }),
  },
}));

import * as Live from '../../../src/application/use-cases/school/SchoolLiveUseCases';
import { prisma } from '../../../src/infrastructure/database/prisma';

const p = prisma as any;
const ctxOf = (over: any = {}) => ({ id: 'su0', schoolId: 'sch1', schoolRole: 'SCHOOL_ADMIN', branchId: null, departmentId: null, classroomId: null, ...over });
const student = (over: any = {}) => ctxOf({ schoolRole: 'STUDENT', ...over });
const goodQ = { content: 'S', options: [{ content: 'A', isCorrect: true }, { content: 'B' }] };

beforeEach(() => {
  jest.clearAllMocks();
  p.schoolUser.findFirst.mockResolvedValue(ctxOf());
  p.school.findUnique.mockResolvedValue({ annualLiveLimit: 0, usedLiveCount: 0 });
  p.liveSession.findUnique.mockResolvedValue(null);
});

describe('CreateSchoolLiveSession — doğrulama + kota + snapshot', () => {
  it('title undefined → TITLE_REQUIRED', async () => {
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ questions: [goodQ] } as any, 'u0')).rejects.toMatchObject({ code: 'TITLE_REQUIRED' });
  });
  it('soru yok → NO_QUESTIONS', async () => {
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [] }, 'u0')).rejects.toMatchObject({ code: 'NO_QUESTIONS' });
  });
  it('soru içeriği/görseli yok → QUESTION_CONTENT_REQUIRED', async () => {
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [{ options: [] } as any] }, 'u0')).rejects.toMatchObject({ code: 'QUESTION_CONTENT_REQUIRED' });
  });
  it('2 şıktan az → TOO_FEW_OPTIONS', async () => {
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [{ content: 'S', options: [{ content: 'A', isCorrect: true }] }] }, 'u0')).rejects.toMatchObject({ code: 'TOO_FEW_OPTIONS' });
  });
  it('tam 1 doğru değil → ONE_CORRECT_REQUIRED', async () => {
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [{ content: 'S', options: [{ content: 'A', isCorrect: true }, { content: 'B', isCorrect: true }] }] }, 'u0')).rejects.toMatchObject({ code: 'ONE_CORRECT_REQUIRED' });
  });
  it('okul yok → SCHOOL_NOT_FOUND', async () => {
    p.school.findUnique.mockResolvedValue(null);
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [goodQ] }, 'u0')).rejects.toMatchObject({ code: 'SCHOOL_NOT_FOUND' });
  });
  it('kota dolu → LIVE_QUOTA_EXCEEDED', async () => {
    p.school.findUnique.mockResolvedValue({ annualLiveLimit: 2, usedLiveCount: 1 });
    p.liveSession.count.mockResolvedValue(1); // used 1 + active 1 >= 2
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [goodQ] }, 'u0')).rejects.toMatchObject({ code: 'LIVE_QUOTA_EXCEEDED' });
  });
  it('başarı (kota limitsiz) → id + joinCode', async () => {
    const r = await new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [goodQ] }, 'u0');
    expect(r).toMatchObject({ id: 'ls1' });
  });
  it('kota limitli ama doluluk altında → başarı', async () => {
    p.school.findUnique.mockResolvedValue({ annualLiveLimit: 5, usedLiveCount: 1 });
    p.liveSession.count.mockResolvedValue(1);
    const r = await new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [goodQ] }, 'u0');
    expect(r.id).toBe('ls1');
  });
  it('questions alanı yok (?? []) → NO_QUESTIONS', async () => {
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T' } as any, 'u0')).rejects.toMatchObject({ code: 'NO_QUESTIONS' });
  });
  it('soru var ama options yok (?? []) → TOO_FEW_OPTIONS', async () => {
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [{ content: 'S' } as any] }, 'u0')).rejects.toMatchObject({ code: 'TOO_FEW_OPTIONS' });
  });
  it('görsel-yalnız soru/şık (content ?? "") → başarı', async () => {
    const r = await new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [{ mediaUrl: 'q.png', options: [{ mediaUrl: 'a.png', isCorrect: true }, { mediaUrl: 'b.png' }] }] }, 'u0');
    expect(r.id).toBe('ls1');
  });
  it('tüm kod denemeleri çakışır → CODE_GEN_FAILED', async () => {
    p.liveSession.findUnique.mockResolvedValue({ id: 'clash' }); // her zaman çakışma → 50 deneme sonrası throw
    await expect(new Live.CreateSchoolLiveSessionUseCase().execute({ title: 'T', questions: [goodQ] }, 'u0')).rejects.toMatchObject({ code: 'CODE_GEN_FAILED' });
  });
});

describe('List — periodId + scope (BRANCH_ADMIN)', () => {
  it('admin: scope null, güncel dönem', async () => {
    p.liveSession.findMany.mockResolvedValue([{ id: 'ls1', title: 'T', joinCode: '1', status: 'DRAFT', currentQuestionIdx: 0, _count: { questions: 2, participants: 0 }, createdAt: new Date() }]);
    const r = await new Live.ListSchoolLiveSessionsUseCase().execute('u0', {});
    expect(r[0].questionCount).toBe(2);
  });
  it('BRANCH_ADMIN: scope OR + periodId', async () => {
    p.schoolUser.findFirst.mockResolvedValue(ctxOf({ schoolRole: 'BRANCH_ADMIN', branchId: 'b1' }));
    p.schoolLevel.findMany.mockResolvedValue([]);
    p.classroom.findMany.mockResolvedValue([]);
    p.department.findMany.mockResolvedValue([]);
    p.liveSession.findMany.mockResolvedValue([]);
    await new Live.ListSchoolLiveSessionsUseCase().execute('u0', { periodId: 'p1' });
    const where = p.liveSession.findMany.mock.calls[0][0].where;
    expect(where.schoolPeriodId).toBe('p1');
    expect(where.OR).toBeTruthy();
  });
});

describe('scopedSession — not-found (Start)', () => {
  it('oturum yok → SESSION_NOT_FOUND', async () => {
    p.liveSession.findFirst.mockResolvedValue(null);
    await expect(new Live.StartSchoolLiveSessionUseCase().execute('lsX', 'u0')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
  it('Start başarı → ok', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 'ls1', currentQuestionIdx: 0 });
    const r = await new Live.StartSchoolLiveSessionUseCase().execute('ls1', 'u0');
    expect(r).toEqual({ ok: true });
  });
  it('Advance/Prev/Toggle', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 'ls1', currentQuestionIdx: 0, showStats: false });
    p.liveQuestion.count.mockResolvedValue(3);
    expect(await new Live.AdvanceSchoolLiveSessionUseCase().execute('ls1', 'u0')).toEqual({ currentQuestionIdx: 1 });
    expect(await new Live.PrevSchoolLiveSessionUseCase().execute('ls1', 'u0')).toEqual({ currentQuestionIdx: 0 });
    expect(await new Live.ToggleSchoolLiveStatsUseCase().execute('ls1', 'u0')).toEqual({ showStats: true });
  });
});

describe('GetSchoolLiveHostState — cur null / cur + stats', () => {
  it('oturum yok → SESSION_NOT_FOUND', async () => {
    p.liveSession.findFirst.mockResolvedValue(null);
    await expect(new Live.GetSchoolLiveHostStateUseCase().execute('lsX', 'u0')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
  it('cur null (idx aralık dışı) → currentQuestion null, stats boş', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 'ls1', title: 'T', joinCode: '1', status: 'DRAFT', currentQuestionIdx: 5, showStats: false, questions: [], _count: { participants: 0 } });
    const r = await new Live.GetSchoolLiveHostStateUseCase().execute('ls1', 'u0');
    expect(r.currentQuestion).toBeNull();
    expect(r.stats).toEqual({});
  });
  it('cur var → stats countByOpt ?? 0', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 'ls1', title: 'T', joinCode: '1', status: 'ACTIVE', currentQuestionIdx: 0, showStats: true,
      questions: [{ id: 'q1', content: 'S', mediaUrl: null, options: [{ id: 'o1', content: 'A', mediaUrl: null, isCorrect: true }, { id: 'o2', content: 'B', mediaUrl: null, isCorrect: false }] }], _count: { participants: 2 } });
    p.liveParticipant.count.mockResolvedValue(2);
    p.liveAnswer.groupBy.mockResolvedValue([{ optionId: 'o1', _count: { _all: 2 } }, { optionId: null, _count: { _all: 1 } }]); // o2 yok → ?? 0
    const r = await new Live.GetSchoolLiveHostStateUseCase().execute('ls1', 'u0');
    expect(r.stats['q1'].find((s: any) => s.optionId === 'o2').count).toBe(0);
    expect(r.currentQuestion!.id).toBe('q1');
  });
});

describe('End — already ended + success', () => {
  it('zaten bitmiş → alreadyEnded', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 'ls1', status: 'ENDED' });
    const r = await new Live.EndSchoolLiveSessionUseCase().execute('ls1', 'u0');
    expect(r).toMatchObject({ alreadyEnded: true });
  });
  it('aktif → biter + kota +1', async () => {
    p.liveSession.findFirst.mockResolvedValue({ id: 'ls1', status: 'ACTIVE' });
    const r = await new Live.EndSchoolLiveSessionUseCase().execute('ls1', 'u0');
    expect(r).toEqual({ ok: true });
  });
});

describe('Join — not-found/cross-school/ended/success', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(student()));
  it('kod yok → SESSION_NOT_FOUND', async () => {
    p.liveSession.findUnique.mockResolvedValue(null);
    await expect(new Live.JoinSchoolLiveSessionUseCase().execute({ joinCode: 'x' }, 'su0')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
  it('schoolId null → SESSION_NOT_FOUND', async () => {
    p.liveSession.findUnique.mockResolvedValue({ id: 'ls1', schoolId: null, status: 'ACTIVE' });
    await expect(new Live.JoinSchoolLiveSessionUseCase().execute({ joinCode: 'x' }, 'su0')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
  it('başka okul → CROSS_SCHOOL', async () => {
    p.liveSession.findUnique.mockResolvedValue({ id: 'ls1', schoolId: 'other', status: 'ACTIVE' });
    await expect(new Live.JoinSchoolLiveSessionUseCase().execute({ joinCode: 'x' }, 'su0')).rejects.toMatchObject({ code: 'CROSS_SCHOOL' });
  });
  it('bitmiş → SESSION_ENDED', async () => {
    p.liveSession.findUnique.mockResolvedValue({ id: 'ls1', schoolId: 'sch1', status: 'ENDED' });
    await expect(new Live.JoinSchoolLiveSessionUseCase().execute({ joinCode: 'x' }, 'su0')).rejects.toMatchObject({ code: 'SESSION_ENDED' });
  });
  it('başarı → sessionId', async () => {
    p.liveSession.findUnique.mockResolvedValue({ id: 'ls1', schoolId: 'sch1', status: 'ACTIVE' });
    const r = await new Live.JoinSchoolLiveSessionUseCase().execute({ joinCode: '123' }, 'su0');
    expect(r).toEqual({ sessionId: 'ls1' });
  });
  it('joinCode yok (?? "") → SESSION_NOT_FOUND', async () => {
    p.liveSession.findUnique.mockResolvedValue(null);
    await expect(new Live.JoinSchoolLiveSessionUseCase().execute({} as any, 'su0')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
  it('Ping → ok', async () => {
    const r = await new Live.PingSchoolLiveSessionUseCase().execute('ls1', 'su0');
    expect(r).toEqual({ ok: true });
  });
});

describe('GetSchoolLiveParticipantState — DRAFT/ENDED/ACTIVE dalları', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(student()));
  const sess = (over: any) => ({ id: 'ls1', title: 'T', status: 'DRAFT', currentQuestionIdx: 0, showStats: false, questions: [], _count: { participants: 1 }, ...over });
  it('oturum yok → SESSION_NOT_FOUND', async () => {
    p.liveSession.findFirst.mockResolvedValue(null);
    await expect(new Live.GetSchoolLiveParticipantStateUseCase().execute('lsX', 'su0')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
  it('katılmamış → NOT_JOINED', async () => {
    p.liveSession.findFirst.mockResolvedValue(sess({}));
    p.liveParticipant.findUnique.mockResolvedValue(null);
    await expect(new Live.GetSchoolLiveParticipantStateUseCase().execute('ls1', 'su0')).rejects.toMatchObject({ code: 'NOT_JOINED' });
  });
  it('DRAFT → status DRAFT', async () => {
    p.liveSession.findFirst.mockResolvedValue(sess({ status: 'DRAFT' }));
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pt1' });
    const r: any = await new Live.GetSchoolLiveParticipantStateUseCase().execute('ls1', 'su0');
    expect(r.status).toBe('DRAFT');
  });
  it('ENDED → myResults (cevaplı + cevapsız + doğru şık yok)', async () => {
    p.liveSession.findFirst.mockResolvedValue(sess({ status: 'ENDED', questions: [
      { id: 'q1', content: 'S1', options: [{ id: 'o1', content: 'A', isCorrect: true }] },
      { id: 'q2', content: 'S2', options: [{ id: 'o3', content: 'C', isCorrect: false }] }, // doğru şık yok → correctOpt undefined
    ] }));
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pt1' });
    p.liveAnswer.findMany.mockResolvedValue([{ questionId: 'q1', optionId: 'o1', option: { id: 'o1', content: 'A', isCorrect: true } }]); // q2 cevapsız
    const r: any = await new Live.GetSchoolLiveParticipantStateUseCase().execute('ls1', 'su0');
    expect(r.myResults.correct).toBe(1);
    const q2 = r.myResults.answers.find((a: any) => a.questionId === 'q2');
    expect(q2).toMatchObject({ chosenOptionId: null, chosenOptionContent: null, correctOptionContent: null });
  });
  it('ACTIVE: cur var, showStats, myAnswer present', async () => {
    p.liveSession.findFirst.mockResolvedValue(sess({ status: 'ACTIVE', showStats: true, currentQuestionIdx: 0, questions: [{ id: 'q1', content: 'S', mediaUrl: null, options: [{ id: 'o1', content: 'A', mediaUrl: null, isCorrect: true }, { id: 'o2', content: 'B', mediaUrl: null, isCorrect: false }] }] }));
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pt1' });
    p.liveAnswer.findUnique.mockResolvedValue({ optionId: 'o1' });
    p.liveAnswer.groupBy.mockResolvedValue([{ optionId: 'o1', _count: { _all: 1 } }]);
    const r: any = await new Live.GetSchoolLiveParticipantStateUseCase().execute('ls1', 'su0');
    expect(r.status).toBe('ACTIVE');
    expect(r.myAnswer).toBe('o1');
    expect(r.stats).toBeTruthy();
  });
  it('ACTIVE: cur null + showStats kapalı + myAnswer null', async () => {
    p.liveSession.findFirst.mockResolvedValue(sess({ status: 'ACTIVE', showStats: false, currentQuestionIdx: 9, questions: [] }));
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pt1' });
    const r: any = await new Live.GetSchoolLiveParticipantStateUseCase().execute('ls1', 'su0');
    expect(r.currentQuestion).toBeNull();
    expect(r.myAnswer).toBeNull();
    expect(r.stats).toBeUndefined();
  });
});

describe('SubmitSchoolLiveAnswer — dallar', () => {
  beforeEach(() => p.schoolUser.findFirst.mockResolvedValue(student()));
  const active = { id: 'ls1', status: 'ACTIVE', currentQuestionIdx: 0, questions: [{ id: 'q1' }] };
  it('oturum yok → SESSION_NOT_FOUND', async () => {
    p.liveSession.findFirst.mockResolvedValue(null);
    await expect(new Live.SubmitSchoolLiveAnswerUseCase().execute('lsX', { questionId: 'q1', optionId: 'o1' }, 'su0')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
  it('aktif değil → NOT_ACTIVE', async () => {
    p.liveSession.findFirst.mockResolvedValue({ ...active, status: 'DRAFT' });
    await expect(new Live.SubmitSchoolLiveAnswerUseCase().execute('ls1', { questionId: 'q1', optionId: 'o1' }, 'su0')).rejects.toMatchObject({ code: 'NOT_ACTIVE' });
  });
  it('güncel soru değil → NOT_CURRENT_QUESTION', async () => {
    p.liveSession.findFirst.mockResolvedValue(active);
    await expect(new Live.SubmitSchoolLiveAnswerUseCase().execute('ls1', { questionId: 'qX', optionId: 'o1' }, 'su0')).rejects.toMatchObject({ code: 'NOT_CURRENT_QUESTION' });
  });
  it('katılmamış → NOT_JOINED', async () => {
    p.liveSession.findFirst.mockResolvedValue(active);
    p.liveParticipant.findUnique.mockResolvedValue(null);
    await expect(new Live.SubmitSchoolLiveAnswerUseCase().execute('ls1', { questionId: 'q1', optionId: 'o1' }, 'su0')).rejects.toMatchObject({ code: 'NOT_JOINED' });
  });
  it('geçersiz şık → INVALID_OPTION', async () => {
    p.liveSession.findFirst.mockResolvedValue(active);
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pt1' });
    p.liveOption.findFirst.mockResolvedValue(null);
    await expect(new Live.SubmitSchoolLiveAnswerUseCase().execute('ls1', { questionId: 'q1', optionId: 'zz' }, 'su0')).rejects.toMatchObject({ code: 'INVALID_OPTION' });
  });
  it('başarı → ok', async () => {
    p.liveSession.findFirst.mockResolvedValue(active);
    p.liveParticipant.findUnique.mockResolvedValue({ id: 'pt1' });
    p.liveOption.findFirst.mockResolvedValue({ id: 'o1' });
    const r = await new Live.SubmitSchoolLiveAnswerUseCase().execute('ls1', { questionId: 'q1', optionId: 'o1' }, 'su0');
    expect(r).toEqual({ ok: true });
  });
});
