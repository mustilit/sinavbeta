import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

const MAX_ANSWER = 10000;

type SnapQuestion = {
  id: string;
  content: string;
  mediaUrl: string | null;
  order: number;
  solutionText: string | null;
  solutionMediaUrl: string | null;
};

/** Aday bu test'in paketine ACTIVE satın alma sahibi mi + snapshot'tan soruları çek. */
async function requirePurchaseAndSnapshot(testId: string, candidateId: string) {
  const test = await prisma.writtenTest.findUnique({
    where: { id: testId },
    select: { id: true, packageId: true, title: true, isTimed: true, duration: true, hasSolutions: true, tenantId: true, deletedAt: true },
  });
  if (!test || test.deletedAt) throw new AppError('WRITTEN_TEST_NOT_FOUND', 'Test bulunamadı', 404);
  if (!test.packageId) throw new AppError('WRITTEN_TEST_NOT_FOUND', 'Test bir pakete bağlı değil', 404);

  const purchase = await prisma.writtenPurchase.findUnique({
    where: { candidateId_packageId: { candidateId, packageId: test.packageId } },
    select: { id: true, status: true, testsSnapshot: true },
  });
  if (!purchase || purchase.status !== 'ACTIVE')
    throw new AppError('NOT_PURCHASED', 'Bu testi çözmek için paketi satın alın', 403);

  // Snapshot'tan ilgili testin soruları; yoksa canlı.
  let questions: SnapQuestion[] | null = null;
  const snap = purchase.testsSnapshot as Array<{ testId: string; questions: SnapQuestion[] }> | null;
  if (Array.isArray(snap)) {
    const entry = snap.find((s) => s.testId === testId);
    if (entry?.questions) questions = entry.questions;
  }
  if (!questions) {
    const live = await prisma.writtenQuestion.findMany({
      where: { testId },
      orderBy: { order: 'asc' },
      select: { id: true, content: true, mediaUrl: true, order: true, solutionText: true, solutionMediaUrl: true },
    });
    questions = live.map((q) => ({
      id: q.id,
      content: q.content,
      mediaUrl: q.mediaUrl ?? null,
      order: q.order,
      solutionText: q.solutionText ?? null,
      solutionMediaUrl: q.solutionMediaUrl ?? null,
    }));
  }
  return { test, questions };
}

/**
 * Aday yazılı test çözmeye başlar. Aktif IN_PROGRESS varsa resume eder; yoksa yeni
 * deneme (attemptNumber = max+1) snapshot ile açılır. Satın alma şart.
 */
export class StartWrittenAttemptUseCase {
  async execute(testId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const { test, questions } = await requirePurchaseAndSnapshot(testId, actorId);

    const active = await prisma.writtenAttempt.findFirst({
      where: { testId, candidateId: actorId, status: { in: ['IN_PROGRESS', 'PAUSED'] } },
      orderBy: { attemptNumber: 'desc' },
    });
    if (active) return { attemptId: active.id, resumed: true };

    const last = await prisma.writtenAttempt.findFirst({
      where: { testId, candidateId: actorId },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    const attemptNumber = (last?.attemptNumber ?? 0) + 1;

    const created = await prisma.writtenAttempt.create({
      data: {
        tenantId: test.tenantId,
        testId,
        candidateId: actorId,
        attemptNumber,
        status: 'IN_PROGRESS',
        remainingSec: test.isTimed && test.duration ? test.duration * 60 : null,
        questionsSnapshot: questions as object,
      },
      select: { id: true },
    });
    return { attemptId: created.id, resumed: false };
  }
}

async function loadOwnedAttempt(attemptId: string, candidateId: string) {
  const attempt = await prisma.writtenAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new AppError('ATTEMPT_NOT_FOUND', 'Deneme bulunamadı', 404);
  if (attempt.candidateId !== candidateId) throw new AppError('NOT_ATTEMPT_OWNER', 'Bu deneme size ait değil', 403);
  return attempt;
}

/** Metin cevabı kaydet/güncelle (boş → sil). Sadece IN_PROGRESS (süre aşımında da kabul). */
export class SubmitWrittenAnswerUseCase {
  async execute(
    attemptId: string,
    questionId: string,
    payload: { textAnswer?: string | null; drawingUrl?: string | null },
    actorId?: string | null,
  ) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const attempt = await loadOwnedAttempt(attemptId, actorId);
    if (attempt.status !== 'IN_PROGRESS')
      throw new AppError('ATTEMPT_NOT_IN_PROGRESS', 'Deneme aktif değil', 409);

    const text = (payload?.textAnswer ?? '').trim().slice(0, MAX_ANSWER);
    const drawingUrl = (payload?.drawingUrl ?? '').trim() || null;
    // Metin VE çizim boşsa cevabı sil (blank). Kalem çizimi de cevaba dahildir.
    if (!text && !drawingUrl) {
      await prisma.writtenAnswer.deleteMany({ where: { attemptId, questionId } });
      return { ok: true, cleared: true };
    }
    await prisma.writtenAnswer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      create: { attemptId, questionId, textAnswer: text || null, drawingUrl },
      update: { textAnswer: text || null, drawingUrl },
    });
    return { ok: true };
  }
}

/** Deneme durumu (soru + metin cevap + zaman). PUAN/isCorrect YOK. Çözüm yalnız SUBMITTED'da. */
export class GetWrittenAttemptStateUseCase {
  async execute(attemptId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const attempt = await loadOwnedAttempt(attemptId, actorId);

    const test = await prisma.writtenTest.findUnique({
      where: { id: attempt.testId },
      select: { id: true, title: true, isTimed: true, duration: true, hasSolutions: true },
    });

    const snap = (attempt.questionsSnapshot as SnapQuestion[] | null) ?? [];
    const answers = await prisma.writtenAnswer.findMany({
      where: { attemptId },
      select: { questionId: true, textAnswer: true, drawingUrl: true },
    });
    const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
    const submitted = attempt.status === 'SUBMITTED' || attempt.status === 'TIMEOUT';

    const questions = snap.map((q, i) => {
      const ans = answerByQ.get(q.id);
      const textAnswer = ans?.textAnswer ?? null;
      const drawingUrl = ans?.drawingUrl ?? null;
      return {
        id: q.id,
        index: i,
        order: q.order,
        content: q.content,
        mediaUrl: q.mediaUrl,
        answered: (textAnswer != null && textAnswer.length > 0) || drawingUrl != null,
        textAnswer,
        drawingUrl,
        // Çözüm sızıntısı engeli: yalnız teslim sonrası inline döner (öz-kıyas).
        ...(submitted ? { solutionText: q.solutionText, solutionMediaUrl: q.solutionMediaUrl } : {}),
      };
    });

    const durationMinutes = test?.isTimed ? test.duration ?? null : null;
    let remainingSeconds: number | null = null;
    let isOvertime = false;
    if (durationMinutes) {
      const deadline = new Date(attempt.startedAt).getTime() + durationMinutes * 60_000;
      const diffMs = deadline - Date.now();
      remainingSeconds = Math.max(0, Math.floor(diffMs / 1000));
      isOvertime = diffMs < 0 && !submitted;
    }
    const answeredCount = questions.filter((q) => q.answered).length;

    return {
      attempt: { id: attempt.id, status: attempt.status, startedAt: attempt.startedAt, submittedAt: attempt.submittedAt },
      test: { id: test?.id, title: test?.title, hasSolutions: test?.hasSolutions ?? true },
      questions,
      timing: { durationMinutes, remainingSeconds, isOvertime },
      summary: { total: questions.length, answeredCount, blankCount: questions.length - answeredCount },
    };
  }
}

/** Denemeyi teslim et. PUAN HESAPLANMAZ — sadece durum + zaman. */
export class SubmitWrittenAttemptUseCase {
  async execute(attemptId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const attempt = await loadOwnedAttempt(attemptId, actorId);
    if (attempt.status === 'SUBMITTED' || attempt.status === 'TIMEOUT') {
      return { ok: true, alreadySubmitted: true };
    }
    if (attempt.status !== 'IN_PROGRESS' && attempt.status !== 'PAUSED')
      throw new AppError('ATTEMPT_INVALID_STATUS', 'Deneme teslim edilemez', 409);

    const now = new Date();
    let overtimeSeconds: number | null = null;
    const test = await prisma.writtenTest.findUnique({
      where: { id: attempt.testId },
      select: { isTimed: true, duration: true },
    });
    if (test?.isTimed && test.duration) {
      const deadline = new Date(attempt.startedAt).getTime() + test.duration * 60_000;
      const over = Math.floor((now.getTime() - deadline) / 1000);
      if (over > 0) overtimeSeconds = over;
    }

    await prisma.writtenAttempt.update({
      where: { id: attemptId },
      data: { status: 'SUBMITTED', submittedAt: now, completedAt: now, finishedAt: now, overtimeSeconds },
    });
    return { ok: true };
  }
}

/** Süre aşımı teslimi (server-side). */
export class TimeoutWrittenAttemptUseCase {
  async execute(attemptId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const attempt = await loadOwnedAttempt(attemptId, actorId);
    if (attempt.status === 'SUBMITTED' || attempt.status === 'TIMEOUT') return { ok: true, alreadySubmitted: true };

    const now = new Date();
    await prisma.writtenAttempt.update({
      where: { id: attemptId },
      data: { status: 'TIMEOUT', submittedAt: now, completedAt: now, finishedAt: now },
    });
    return { ok: true };
  }
}

/** "Çözümü gör" — soru çözümünü servis eder (sahip + hasSolutions). */
export class GetWrittenQuestionSolutionUseCase {
  async execute(attemptId: string, questionId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const attempt = await loadOwnedAttempt(attemptId, actorId);
    if (!['IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'TIMEOUT'].includes(attempt.status))
      throw new AppError('ATTEMPT_INVALID_STATUS', 'Deneme geçersiz durumda', 409);

    const test = await prisma.writtenTest.findUnique({
      where: { id: attempt.testId },
      select: { hasSolutions: true },
    });
    if (!test?.hasSolutions) throw new AppError('SOLUTIONS_DISABLED', 'Bu testte çözüm yok', 400);

    const snap = (attempt.questionsSnapshot as SnapQuestion[] | null) ?? [];
    const q = snap.find((x) => x.id === questionId);
    if (!q) throw new AppError('QUESTION_NOT_IN_TEST', 'Soru bu denemeye ait değil', 404);
    return { questionId, solutionText: q.solutionText, solutionMediaUrl: q.solutionMediaUrl };
  }
}
