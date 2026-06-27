import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { normalizeExamLanguage } from '../../../common/examLanguages';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;

type Input = {
  title: string;
  description?: string | null;
  examTypeId: string;
  gradeLevelId?: string | null;
  topicId: string;
  priceCents?: number;
  language?: string;
  coverImageUrl?: string | null;
};

/**
 * Wizard 1 — Eğitici sınav türü + konu + başlık seçerek tüneli (DRAFT) oluşturur.
 * Katman sayısı/seçenek sayısı/streak admin ayarından SNAPSHOT'lanır (admin sonradan
 * değiştirse bu tünel bozulmaz). layerCount kadar boş TunnelLayer (1..N) açılır.
 */
export class CreateTunnelUseCase {
  async execute(input: Input, actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);

    const title = (input.title ?? '').trim();
    if (!title) throw new AppError('TUNNEL_TITLE_REQUIRED', 'Başlık zorunlu', 400);
    if (title.length > MAX_TITLE)
      throw new AppError('TUNNEL_TITLE_TOO_LONG', `Başlık en fazla ${MAX_TITLE} karakter`, 400);
    if (!input.examTypeId || !UUID_RE.test(input.examTypeId))
      throw new AppError('INVALID_EXAMTYPE', 'Geçerli bir sınav türü seçin', 400);
    if (!input.topicId || !UUID_RE.test(input.topicId))
      throw new AppError('INVALID_TOPIC', 'Geçerli bir konu seçin', 400);

    const educator = await prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, tenantId: true },
    });
    if (!educator) throw new AppError('UNAUTHORIZED', 'Kullanıcı bulunamadı', 401);

    const examType = await prisma.examType.findUnique({ where: { id: input.examTypeId }, select: { id: true } });
    if (!examType) throw new AppError('EXAMTYPE_NOT_FOUND', 'Sınav türü bulunamadı', 404);
    const topic = await prisma.topic.findUnique({ where: { id: input.topicId }, select: { id: true } });
    if (!topic) throw new AppError('TOPIC_NOT_FOUND', 'Konu bulunamadı', 404);

    // Sınıf (GradeLevel): seçilmediyse "Genel" fallback.
    let gradeLevelId: string | null = input.gradeLevelId ?? null;
    if (gradeLevelId) {
      const gl = await prisma.gradeLevel.findUnique({ where: { id: gradeLevelId }, select: { id: true } });
      if (!gl) throw new AppError('GRADELEVEL_NOT_FOUND', 'Sınıf bulunamadı', 404);
    } else {
      const genel = await prisma.gradeLevel.findUnique({ where: { slug: 'genel' }, select: { id: true } });
      gradeLevelId = genel?.id ?? null;
    }

    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const layerCount = settings?.maxLayersPerTunnel ?? 7;
    const optionsPerQuestion = settings?.tunnelOptionsPerQuestion ?? 10;
    const advanceStreak = settings?.tunnelAdvanceStreak ?? 10;

    const priceCents = Math.max(0, Math.floor(input.priceCents ?? 0));
    const minPrice = settings?.minTunnelPriceCents ?? 0;
    if (priceCents < minPrice)
      throw new AppError('TUNNEL_PRICE_TOO_LOW', `Tünel fiyatı en az ${(minPrice / 100).toFixed(2)} ₺ olmalı`, 400);

    const tunnel = await prisma.tunnel.create({
      data: {
        tenantId: educator.tenantId,
        educatorId: educator.id,
        examTypeId: input.examTypeId,
        gradeLevelId,
        topicId: input.topicId,
        title,
        description: (input.description ?? '').trim() || null,
        coverImageUrl: (input.coverImageUrl ?? '').trim() || null,
        priceCents,
        language: normalizeExamLanguage(input.language),
        layerCount,
        optionsPerQuestion,
        advanceStreak,
        status: 'DRAFT',
        layers: {
          create: Array.from({ length: layerCount }, (_, i) => ({ index: i + 1 })),
        },
      },
      include: { layers: { orderBy: { index: 'asc' } } },
    });

    return tunnel;
  }
}
