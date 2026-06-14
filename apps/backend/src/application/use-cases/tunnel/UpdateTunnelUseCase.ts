import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { serializeTunnelDetail } from './GetTunnelUseCase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;
const EDITABLE: ReadonlySet<string> = new Set(['DRAFT', 'REJECTED']);

type Input = {
  title?: string;
  description?: string | null;
  examTypeId?: string;
  topicId?: string;
  priceCents?: number;
  coverImageUrl?: string | null;
};

/**
 * Wizard 1'e geri dönüş — eğitici tünelin meta bilgilerini (başlık, açıklama,
 * sınav türü, konu, fiyat, kapak görseli) günceller. Yalnız sahibi ve yalnız
 * DRAFT/REJECTED durumunda. Katman/seçenek snapshot'ı (layerCount vb.) DEĞİŞMEZ.
 */
export class UpdateTunnelUseCase {
  async execute(tunnelId: string, input: Input, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const tunnel = await prisma.tunnel.findUnique({
      where: { id: tunnelId },
      select: { id: true, educatorId: true, status: true },
    });
    if (!tunnel) throw new AppError('TUNNEL_NOT_FOUND', 'Tünel bulunamadı', 404);
    if (tunnel.educatorId !== actorId) throw new AppError('FORBIDDEN', 'Bu tünel size ait değil', 403);
    if (!EDITABLE.has(tunnel.status))
      throw new AppError('TUNNEL_NOT_EDITABLE', 'Onaya gönderilmiş/yayınlı tünel düzenlenemez', 409);

    const data: Record<string, unknown> = {};

    if (input.title !== undefined) {
      const title = (input.title ?? '').trim();
      if (!title) throw new AppError('TUNNEL_TITLE_REQUIRED', 'Başlık zorunlu', 400);
      if (title.length > MAX_TITLE)
        throw new AppError('TUNNEL_TITLE_TOO_LONG', `Başlık en fazla ${MAX_TITLE} karakter`, 400);
      data.title = title;
    }
    if (input.description !== undefined) data.description = (input.description ?? '').trim() || null;
    if (input.coverImageUrl !== undefined) data.coverImageUrl = (input.coverImageUrl ?? '').trim() || null;

    if (input.examTypeId !== undefined) {
      if (!input.examTypeId || !UUID_RE.test(input.examTypeId))
        throw new AppError('INVALID_EXAMTYPE', 'Geçerli bir sınav türü seçin', 400);
      const et = await prisma.examType.findUnique({ where: { id: input.examTypeId }, select: { id: true } });
      if (!et) throw new AppError('EXAMTYPE_NOT_FOUND', 'Sınav türü bulunamadı', 404);
      data.examTypeId = input.examTypeId;
    }
    if (input.topicId !== undefined) {
      if (!input.topicId || !UUID_RE.test(input.topicId))
        throw new AppError('INVALID_TOPIC', 'Geçerli bir konu seçin', 400);
      const tp = await prisma.topic.findUnique({ where: { id: input.topicId }, select: { id: true } });
      if (!tp) throw new AppError('TOPIC_NOT_FOUND', 'Konu bulunamadı', 404);
      data.topicId = input.topicId;
    }
    if (input.priceCents !== undefined) data.priceCents = Math.max(0, Math.floor(input.priceCents));

    const updated = await prisma.tunnel.update({
      where: { id: tunnelId },
      data,
      include: {
        examType: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
        educator: { select: { id: true, username: true } },
        layers: {
          orderBy: { index: 'asc' },
          include: {
            questions: {
              orderBy: { order: 'asc' },
              include: { options: { orderBy: { order: 'asc' } } },
            },
          },
        },
      },
    });
    return serializeTunnelDetail(updated);
  }
}
