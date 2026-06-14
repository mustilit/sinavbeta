import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { pickNextPresentation, isMastered } from './engine';
import { loadPlayData, loadMasks, buildAttemptState, PlayData } from './tunnelPlay';

/** Geçerli bir current soru yoksa seç + persist; yoksa tünel tamamlanmış demektir. */
export async function ensureCurrentQuestion(attempt: any, play: PlayData, masks: Map<string, number>) {
  if (attempt.status === 'COMPLETED') return attempt;
  const stillValid =
    attempt.currentQuestionId &&
    play.qmeta.has(attempt.currentQuestionId) &&
    !isMastered(masks.get(attempt.currentQuestionId) ?? 0);
  if (stillValid) return attempt;

  const pick = pickNextPresentation({
    questions: play.questions,
    baseLayer: attempt.baseLayer,
    upperOpen: attempt.upperOpen,
    masks,
  });
  if (!pick) {
    // Görünür katmanda öğrenilmemiş soru yok → (Submit normalde tabanı ilerletir;
    // buraya düşülürse tüm görünür içerik öğrenilmiş demektir) tamamla.
    return prisma.tunnelAttempt.update({
      where: { id: attempt.id },
      data: { status: 'COMPLETED', completedAt: new Date(), currentQuestionId: null, currentOrderJson: null, currentCorrectPosition: null },
    });
  }
  return prisma.tunnelAttempt.update({
    where: { id: attempt.id },
    data: { currentQuestionId: pick.questionId, currentCorrectPosition: pick.correctPosition, currentOrderJson: JSON.stringify(pick.order) },
  });
}

async function requireActivePurchase(candidateId: string, tunnelId: string) {
  const p = await prisma.tunnelPurchase.findUnique({
    where: { candidateId_tunnelId: { candidateId, tunnelId } },
  });
  if (!p || p.status !== 'ACTIVE') throw new AppError('TUNNEL_NOT_PURCHASED', 'Önce tüneli satın alın', 403);
}

/** Tüneli başlat veya kaldığı yerden sürdür (aday+tünel başına tek attempt). */
export class StartTunnelAttemptUseCase {
  async execute(tunnelId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    await requireActivePurchase(actorId, tunnelId);

    const candidate = await prisma.user.findUnique({ where: { id: actorId }, select: { tenantId: true } });

    let attempt = await prisma.tunnelAttempt.findUnique({
      where: { candidateId_tunnelId: { candidateId: actorId, tunnelId } },
    });
    if (!attempt) {
      attempt = await prisma.tunnelAttempt.create({
        data: { tenantId: candidate?.tenantId ?? 'dev-tenant', tunnelId, candidateId: actorId },
      });
    }

    const play = await loadPlayData(tunnelId);
    const masks = await loadMasks(attempt.id);
    attempt = await ensureCurrentQuestion(attempt, play, masks);
    return buildAttemptState(attempt, play, masks);
  }
}

/** Mevcut attempt durumunu döndürür (sayfa yenileme). */
export class GetTunnelAttemptStateUseCase {
  async execute(tunnelId: string, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    await requireActivePurchase(actorId, tunnelId);
    let attempt = await prisma.tunnelAttempt.findUnique({
      where: { candidateId_tunnelId: { candidateId: actorId, tunnelId } },
    });
    if (!attempt) throw new AppError('ATTEMPT_NOT_FOUND', 'Önce tüneli başlatın', 404);
    const play = await loadPlayData(tunnelId);
    const masks = await loadMasks(attempt.id);
    attempt = await ensureCurrentQuestion(attempt, play, masks);
    return buildAttemptState(attempt, play, masks);
  }
}
