import { Logger } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { ModerateTextContentUseCase } from '../moderation/ModerateTextContentUseCase';

const moderationLogger = new Logger('TunnelQuestionModeration');

type OptionInput = { content: string; mediaUrl?: string | null; isCorrect: boolean };
type QuestionInput = { content: string; mediaUrl?: string | null; options: OptionInput[] };
type LayerInput = { index: number; questions: QuestionInput[] };

/** İçerik VEYA görsel varsa "dolu" sayılır (normal test gibi görsel-only şık/soru). */
const filled = (text?: string | null, media?: string | null) =>
  !!(text ?? '').trim() || !!(media ?? '').trim();

const EDITABLE: ReadonlySet<string> = new Set(['DRAFT', 'REJECTED']);

/**
 * Wizard 2 — Eğitici her katman için soruları (her biri optionsPerQuestion seçenekli,
 * tam 1 doğru) kaydeder. Tünelin TÜM soruları yeniden yazılır (replace). Yalnızca
 * DRAFT/REJECTED durumunda düzenlenebilir; onaya gönderilmiş/yayınlı tünel kilitli.
 * Yapısal doğrulama burada (seçenek sayısı + tek doğru); katman başına min/max soru
 * sayısı asıl SubmitTunnelForApproval'da zorlanır (taslak yarım kaydedilebilsin).
 */
export class SaveTunnelQuestionsUseCase {
  constructor(private readonly moderate?: ModerateTextContentUseCase) {}

  async execute(tunnelId: string, layers: LayerInput[], actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const tunnel = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      include: { layers: { select: { id: true, index: true } } },
    });
    if (!tunnel) throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);
    if (tunnel.educatorId !== actorId) throw new AppError('FORBIDDEN', 'Bu tünel size ait değil', 403);
    if (!EDITABLE.has(tunnel.status))
      throw new AppError('TUNNEL_NOT_EDITABLE', 'Onaya gönderilmiş/yayınlı tünel düzenlenemez', 409);

    const layerByIndex = new Map(tunnel.layers.map((l) => [l.index, l.id]));
    const opc = tunnel.optionsPerQuestion;

    // Yapısal doğrulama
    for (const layer of layers ?? []) {
      if (!layerByIndex.has(layer.index))
        throw new AppError('INVALID_LAYER', `Geçersiz katman: ${layer.index}`, 400);
      for (const q of layer.questions ?? []) {
        if (!filled(q.content, q.mediaUrl))
          throw new AppError('QUESTION_EMPTY', `Katman ${layer.index}: soru metni veya görseli gerekli`, 400);
        const opts = q.options ?? [];
        if (opts.length !== opc)
          throw new AppError('OPTION_COUNT', `Her soru tam ${opc} seçenek içermeli`, 400);
        if (opts.some((o) => !filled(o.content, o.mediaUrl)))
          throw new AppError('OPTION_EMPTY', 'Seçenek metni veya görseli gerekli', 400);
        if (opts.filter((o) => o.isCorrect).length !== 1)
          throw new AppError('ONE_CORRECT', 'Her soruda tam 1 doğru seçenek olmalı', 400);
      }
    }

    await prisma.$transaction(async (tx) => {
      // Mevcut soruları sil (option'lar cascade ile gider)
      await tx.tunnelQuestion.deleteMany({ where: { tunnelId } });
      for (const layer of layers ?? []) {
        const layerId = layerByIndex.get(layer.index)!;
        let order = 0;
        for (const q of layer.questions ?? []) {
          await tx.tunnelQuestion.create({
            data: {
              tunnelId,
              layerId,
              content: q.content.trim(),
              mediaUrl: (q.mediaUrl ?? '').trim() || null,
              order: order++,
              options: {
                create: q.options.map((o, i) => ({
                  content: (o.content ?? '').trim(),
                  mediaUrl: (o.mediaUrl ?? '').trim() || null,
                  isCorrect: !!o.isCorrect,
                  order: i + 1,
                })),
              },
            },
          });
        }
      }
      await tx.tunnel.update({ where: { id: tunnelId }, data: { updatedAt: new Date() } });
    });

    // Best-effort eğitici içerik moderasyonu (metin) — akışı bloke etmez.
    if (this.moderate) {
      const moderate = this.moderate;
      setImmediate(async () => {
        try {
          const base = {
            entityType: 'TunnelQuestion' as const,
            entityId: tunnelId,
            userId: tunnel.educatorId ?? '',
            tenantId: tunnel.tenantId ?? '',
            isEducatorContent: true,
          };
          const qs = (layers ?? []).flatMap((l) => l.questions ?? []);
          const text = qs
            .flatMap((q) => [q.content, ...(q.options ?? []).map((o) => o.content)])
            .filter((s) => (s ?? '').trim())
            .join('\n');
          if (text.trim()) await moderate.execute({ ...base, text });
          const images = qs
            .flatMap((q) => [q.mediaUrl, ...(q.options ?? []).map((o) => o.mediaUrl)])
            .filter((u): u is string => !!u && u.trim().length > 0);
          for (const img of images) await moderate.moderateImage({ ...base, imageUrl: img });
        } catch (err: any) {
          moderationLogger.warn(`tunnel.question.moderation_failed ${err?.message} tid=${tunnelId}`);
        }
      });
    }

    return { ok: true };
  }
}
