import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';

function summary(t: any) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    coverImageUrl: t.coverImageUrl ?? null,
    priceCents: t.priceCents,
    currency: t.currency,
    layerCount: t.layerCount,
    examTypeName: t.examType?.name ?? null,
    gradeLevelId: t.gradeLevelId ?? null,
    gradeLevelName: t.gradeLevel?.name ?? null,
    topicName: t.topic?.name ?? null,
    educatorUsername: t.educator?.username ?? null,
    questionCount: t._count?.questions ?? 0,
    submittedAt: t.submittedAt?.toISOString() ?? null,
    publishedAt: t.publishedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt?.toISOString?.() ?? null,
  };
}

const LIST_INCLUDE = {
  examType: { select: { name: true } },
  gradeLevel: { select: { name: true } },
  topic: { select: { name: true } },
  educator: { select: { username: true } },
  _count: { select: { questions: true } },
} as const;

/** Eğiticinin kendi tünelleri (tüm durumlar). */
export class ListEducatorTunnelsUseCase {
  async execute(actorId?: string | null) {
    if (!actorId) throw new AppError('UNAUTHORIZED', 'Giriş gerekli', 401);
    const rows = await prisma.tunnel.findMany({
      where: { educatorId: actorId },
      orderBy: [{ updatedAt: 'desc' }],
      include: LIST_INCLUDE,
    });
    return { items: rows.map(summary) };
  }
}

/** Admin: onay bekleyen tüneller (PENDING_APPROVAL). */
export class ListPendingTunnelsUseCase {
  async execute() {
    const rows = await prisma.tunnel.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: [{ submittedAt: 'asc' }],
      include: LIST_INCLUDE,
    });
    return { items: rows.map(summary) };
  }
}
