/**
 * E-Sınıf tünel adaptif çözme — market Start/Submit/GetState use-case'lerinin okul karşılığı.
 * Saf motor (tunnel/engine.ts) yeniden kullanılır. Öğrenci+sınav başına tek deneme.
 */
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { applyAnswer, pickNextPresentation, isMastered } from '../tunnel/engine';
import { resolveSchoolContext, requireSchoolRole } from './schoolHelpers';
import { loadSchoolPlayData, loadSchoolMasks, buildSchoolAttemptState, SchoolPlayData } from './schoolTunnelPlay';

/** Geçerli current soru yoksa seç + persist; görünür içerik bittiyse tamamla. */
async function ensureCurrentQuestion(attempt: any, play: SchoolPlayData, masks: Map<string, number>) {
  if (attempt.status === 'COMPLETED') return attempt;
  const stillValid =
    attempt.currentQuestionId &&
    play.qmeta.has(attempt.currentQuestionId) &&
    !isMastered(masks.get(attempt.currentQuestionId) ?? 0);
  if (stillValid) return attempt;

  const pick = pickNextPresentation({ questions: play.questions, baseLayer: attempt.baseLayer, upperOpen: attempt.upperOpen, masks });
  if (!pick) {
    return prisma.schoolTunnelAttempt.update({
      where: { id: attempt.id },
      data: { status: 'COMPLETED', completedAt: new Date(), currentQuestionId: null, currentOrderJson: null, currentCorrectPosition: null },
    });
  }
  return prisma.schoolTunnelAttempt.update({
    where: { id: attempt.id },
    data: { currentQuestionId: pick.questionId, currentCorrectPosition: pick.correctPosition, currentOrderJson: JSON.stringify(pick.order) },
  });
}

/** Sınavın tünel + aynı okul olduğunu doğrula; play data döndür. */
async function loadAndAuthorize(examId: string, ctx: { schoolId: string }) {
  const play = await loadSchoolPlayData(examId);
  if (play.exam.examType !== 'TUNNEL') throw new AppError('NOT_TUNNEL', 'Bu sınav tünel değil', 400);
  if (play.exam.schoolId !== ctx.schoolId) throw new AppError('CROSS_SCHOOL', 'Bu sınav okulunuza ait değil', 403);
  return play;
}

/** Tüneli başlat veya kaldığı yerden sürdür. */
export class StartSchoolTunnelUseCase {
  async execute(examId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const play = await loadAndAuthorize(examId, ctx);

    let attempt = await prisma.schoolTunnelAttempt.findUnique({ where: { examId_studentId: { examId, studentId: actorId as string } } });
    if (!attempt) {
      attempt = await prisma.schoolTunnelAttempt.create({ data: { examId, studentId: actorId as string } });
    }
    const masks = await loadSchoolMasks(attempt.id);
    attempt = await ensureCurrentQuestion(attempt, play, masks);
    return buildSchoolAttemptState(attempt, play, masks);
  }
}

/** Mevcut durum (sayfa yenileme). */
export class GetSchoolTunnelStateUseCase {
  async execute(examId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const play = await loadAndAuthorize(examId, ctx);
    let attempt = await prisma.schoolTunnelAttempt.findUnique({ where: { examId_studentId: { examId, studentId: actorId as string } } });
    if (!attempt) throw new AppError('ATTEMPT_NOT_FOUND', 'Önce tüneli başlatın', 404);
    const masks = await loadSchoolMasks(attempt.id);
    attempt = await ensureCurrentQuestion(attempt, play, masks);
    return buildSchoolAttemptState(attempt, play, masks);
  }
}

/** Cevabı işle — adaptif motor (ustalık + streak/pencere + katman ilerleme). */
export class SubmitSchoolTunnelAnswerUseCase {
  async execute(examId: string, selectedOptionId: string, actorId?: string) {
    const ctx = await resolveSchoolContext(actorId);
    requireSchoolRole(ctx, 'STUDENT');
    const play = await loadAndAuthorize(examId, ctx);

    const attempt = await prisma.schoolTunnelAttempt.findUnique({ where: { examId_studentId: { examId, studentId: actorId as string } } });
    if (!attempt) throw new AppError('ATTEMPT_NOT_FOUND', 'Önce tüneli başlatın', 404);
    if (attempt.status !== 'IN_PROGRESS') throw new AppError('ATTEMPT_DONE', 'Tünel tamamlandı', 409);
    if (!attempt.currentQuestionId || !attempt.currentCorrectPosition) throw new AppError('NO_CURRENT_QUESTION', 'Aktif soru yok', 409);

    const engineQ = play.questions.find((q) => q.id === attempt.currentQuestionId);
    const meta = play.qmeta.get(attempt.currentQuestionId);
    if (!engineQ || !meta) throw new AppError('QUESTION_GONE', 'Soru bulunamadı', 409);
    if (!meta.options.some((o) => o.id === selectedOptionId)) throw new AppError('INVALID_OPTION', 'Geçersiz seçenek', 400);

    const masks = await loadSchoolMasks(attempt.id);
    const correct = selectedOptionId === engineQ.correctOptionId;

    const res = applyAnswer({
      correct,
      questionLayerIndex: engineQ.layerIndex,
      baseLayer: attempt.baseLayer,
      upperOpen: attempt.upperOpen,
      streakCount: attempt.streakCount,
      advanceStreak: play.exam.advanceStreak,
      layerCount: play.exam.layerCount,
      questionMask: masks.get(engineQ.id) ?? 0,
      correctPosition: attempt.currentCorrectPosition,
    });

    await prisma.schoolTunnelProgress.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: engineQ.id } },
      create: { attemptId: attempt.id, questionId: engineQ.id, correctMask: res.newMask, mastered: res.mastered },
      update: { correctMask: res.newMask, mastered: res.mastered },
    });
    masks.set(engineQ.id, res.newMask);

    let baseLayer = res.baseLayer;
    let upperOpen = res.upperOpen;
    let streakCount = res.streakCount;
    const layerMastered = (idx: number) =>
      play.questions.filter((q) => q.layerIndex === idx).every((q) => isMastered(masks.get(q.id) ?? 0));
    while (baseLayer <= play.exam.layerCount && layerMastered(baseLayer)) {
      baseLayer += 1;
      upperOpen = false;
      streakCount = 0;
    }
    const completed = baseLayer > play.exam.layerCount;

    let updateData: any = { baseLayer, upperOpen, streakCount, lastActivityAt: new Date() };
    if (completed) {
      updateData = { ...updateData, status: 'COMPLETED', completedAt: new Date(), currentQuestionId: null, currentCorrectPosition: null, currentOrderJson: null };
    } else {
      const pick = pickNextPresentation({ questions: play.questions, baseLayer, upperOpen, masks, excludeQuestionId: engineQ.id });
      if (pick) {
        updateData = { ...updateData, currentQuestionId: pick.questionId, currentCorrectPosition: pick.correctPosition, currentOrderJson: JSON.stringify(pick.order) };
      } else {
        updateData = { ...updateData, status: 'COMPLETED', completedAt: new Date(), currentQuestionId: null, currentCorrectPosition: null, currentOrderJson: null };
      }
    }

    const updated = await prisma.schoolTunnelAttempt.update({ where: { id: attempt.id }, data: updateData });
    return {
      correct,
      correctOptionId: engineQ.correctOptionId,
      masteredQuestion: res.mastered,
      completed: updated.status === 'COMPLETED',
      state: buildSchoolAttemptState(updated, play, masks),
    };
  }
}
