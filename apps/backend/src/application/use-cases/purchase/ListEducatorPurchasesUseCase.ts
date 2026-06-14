import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';

/** Eğitici satış listesi - test paketi VE tünel satın almaları */
export interface EducatorPurchaseItem {
  id: string;
  testId: string; // paket için testId, tünel için tunnelId
  testTitle: string;
  candidateId: string;
  candidateEmail: string;
  candidateName: string | null;
  amountCents: number | null;
  status: string;
  createdAt: Date;
  kind: 'package' | 'tunnel'; // satış türü — UI rozet + ayrıştırma
}

export class ListEducatorPurchasesUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(educatorId: string): Promise<EducatorPurchaseItem[]> {
    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 403);

    const [testIds, tunnelIds] = await Promise.all([
      prisma.examTest.findMany({ where: { educatorId }, select: { id: true } }).then((r) => r.map((t) => t.id)),
      prisma.tunnel.findMany({ where: { educatorId }, select: { id: true } }).then((r) => r.map((t) => t.id)),
    ]);

    const [purchases, tunnelPurchases] = await Promise.all([
      testIds.length
        ? prisma.purchase.findMany({
            where: { testId: { in: testIds } },
            orderBy: { createdAt: 'desc' },
            include: {
              test: { select: { id: true, title: true } },
              candidate: { select: { id: true, email: true, username: true } },
            },
          })
        : Promise.resolve([]),
      tunnelIds.length
        ? prisma.tunnelPurchase.findMany({
            where: { tunnelId: { in: tunnelIds } },
            orderBy: { createdAt: 'desc' },
            include: {
              tunnel: { select: { id: true, title: true } },
              candidate: { select: { id: true, email: true, username: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const packageItems: EducatorPurchaseItem[] = purchases.map((p) => ({
      id: p.id,
      testId: p.testId,
      testTitle: p.test?.title ?? '',
      candidateId: p.candidateId,
      candidateEmail: p.candidate?.email ?? '',
      candidateName: p.candidate?.username ?? null,
      amountCents: p.amountCents,
      status: p.status,
      createdAt: p.createdAt,
      kind: 'package',
    }));

    const tunnelItems: EducatorPurchaseItem[] = tunnelPurchases.map((tp: any) => ({
      id: tp.id,
      testId: tp.tunnelId,
      testTitle: tp.tunnel?.title ?? '',
      candidateId: tp.candidateId,
      candidateEmail: tp.candidate?.email ?? '',
      candidateName: tp.candidate?.username ?? null,
      amountCents: tp.amountCents,
      status: tp.status,
      createdAt: tp.createdAt,
      kind: 'tunnel',
    }));

    // En yeni satış üstte (iki kaynağı birleştirip sırala)
    return [...packageItems, ...tunnelItems].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
