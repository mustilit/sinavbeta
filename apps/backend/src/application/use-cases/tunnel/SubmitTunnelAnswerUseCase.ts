import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { applyAnswer, pickNextPresentation, isMastered } from './engine';
import { loadPlayData, loadMasks, buildAttemptState } from './tunnelPlay';

/**
 * Tünel cevabı işle — adaptif motor. O an sunulan soruya verilen cevabı değerlendirir,
 * pozisyon ustalığını + kayan pencere/streak durumunu günceller, taban katmanı (tam
 * öğrenilince) ilerletir, tüm katmanlar öğrenilince tüneli tamamlar, sıradaki soruyu seçer.
 */
export class SubmitTunnelAnswerUseCase {
  async execute(tunnelId: string, selectedOptionId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const attempt = await prisma.tunnelAttempt.findUnique({
      where: { candidateId_tunnelId: { candidateId: actorId, tunnelId } },
    });
    if (!attempt) throw new AppError('ATTEMPT_NOT_FOUND', 'Önce tüneli başlatın', 404);
    if (attempt.status !== 'IN_PROGRESS') throw new AppError('ATTEMPT_DONE', 'Tünel tamamlandı', 409);
    if (!attempt.currentQuestionId || !attempt.currentCorrectPosition)
      throw new AppError('NO_CURRENT_QUESTION', 'Aktif soru yok', 409);

    const play = await loadPlayData(tunnelId);
    const engineQ = play.questions.find((q) => q.id === attempt.currentQuestionId);
    const meta = play.qmeta.get(attempt.currentQuestionId);
    if (!engineQ || !meta) throw new AppError('QUESTION_GONE', 'Soru bulunamadı', 409);
    if (!meta.options.some((o) => o.id === selectedOptionId))
      throw new AppError('INVALID_OPTION', 'Geçersiz seçenek', 400);

    const masks = await loadMasks(attempt.id);
    const correct = selectedOptionId === engineQ.correctOptionId;

    // 1) Motoru uygula (ustalık biti + streak/pencere)
    const res = applyAnswer({
      correct,
      questionLayerIndex: engineQ.layerIndex,
      baseLayer: attempt.baseLayer,
      upperOpen: attempt.upperOpen,
      streakCount: attempt.streakCount,
      advanceStreak: play.tunnel.advanceStreak,
      layerCount: play.tunnel.layerCount,
      questionMask: masks.get(engineQ.id) ?? 0,
      correctPosition: attempt.currentCorrectPosition,
    });

    // 2) Soru ilerlemesini kaydet
    await prisma.tunnelQuestionProgress.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: engineQ.id } },
      create: { attemptId: attempt.id, questionId: engineQ.id, correctMask: res.newMask, mastered: res.mastered },
      update: { correctMask: res.newMask, mastered: res.mastered },
    });
    masks.set(engineQ.id, res.newMask);

    // 3) Taban katmanı ilerlet (tam öğrenilen katmanları atla) + tamamlanma
    let baseLayer = res.baseLayer;
    let upperOpen = res.upperOpen;
    let streakCount = res.streakCount;
    const layerMastered = (idx: number) =>
      play.questions.filter((q) => q.layerIndex === idx).every((q) => isMastered(masks.get(q.id) ?? 0));
    while (baseLayer <= play.tunnel.layerCount && layerMastered(baseLayer)) {
      baseLayer += 1;
      upperOpen = false;
      streakCount = 0;
    }
    const completed = baseLayer > play.tunnel.layerCount;

    // 4) Sıradaki soru / tamamla
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

    const updated = await prisma.tunnelAttempt.update({ where: { id: attempt.id }, data: updateData });

    return {
      correct,
      correctOptionId: engineQ.correctOptionId, // cevap sonrası gösterim (öğrenme)
      masteredQuestion: res.mastered,
      completed: updated.status === 'COMPLETED',
      state: buildAttemptState(updated, play, masks),
    };
  }
}
