import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

type OptionInput = { content: string; isCorrect: boolean };
type QuestionInput = { content: string; mediaUrl?: string | null; options: OptionInput[] };
type LayerInput = { index: number; questions: QuestionInput[] };

const EDITABLE: ReadonlySet<string> = new Set(['DRAFT', 'REJECTED']);

/**
 * Wizard 2 — Eğitici her katman için soruları (her biri optionsPerQuestion seçenekli,
 * tam 1 doğru) kaydeder. Tünelin TÜM soruları yeniden yazılır (replace). Yalnızca
 * DRAFT/REJECTED durumunda düzenlenebilir; onaya gönderilmiş/yayınlı tünel kilitli.
 * Yapısal doğrulama burada (seçenek sayısı + tek doğru); katman başına min/max soru
 * sayısı asıl SubmitTunnelForApproval'da zorlanır (taslak yarım kaydedilebilsin).
 */
export class SaveTunnelQuestionsUseCase {
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
        if (!(q.content ?? '').trim())
          throw new AppError('QUESTION_EMPTY', `Katman ${layer.index}: soru metni boş`, 400);
        const opts = q.options ?? [];
        if (opts.length !== opc)
          throw new AppError('OPTION_COUNT', `Her soru tam ${opc} seçenek içermeli`, 400);
        if (opts.some((o) => !(o.content ?? '').trim()))
          throw new AppError('OPTION_EMPTY', 'Seçenek metni boş olamaz', 400);
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
                  content: o.content.trim(),
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

    return { ok: true };
  }
}
