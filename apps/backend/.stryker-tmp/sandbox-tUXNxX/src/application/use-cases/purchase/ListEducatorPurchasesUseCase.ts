// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';

/** Eğitici satış listesi - testlerine yapılan satın almalar */
export interface EducatorPurchaseItem {
  id: string;
  testId: string;
  testTitle: string;
  candidateId: string;
  candidateEmail: string;
  candidateName: string | null;
  amountCents: number | null;
  status: string;
  createdAt: Date;
}

export class ListEducatorPurchasesUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(educatorId: string): Promise<EducatorPurchaseItem[]> {
    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    if (user.role !== 'EDUCATOR') throw new AppError('USER_NOT_EDUCATOR', 'User is not an educator', 403);

    const testIds = await prisma.examTest.findMany({
      where: { educatorId },
      select: { id: true },
    }).then((r) => r.map((t) => t.id));

    if (testIds.length === 0) return [];

    const purchases = await prisma.purchase.findMany({
      where: { testId: { in: testIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        test: { select: { id: true, title: true } },
        candidate: { select: { id: true, email: true, username: true } },
      },
    });

    return purchases.map((p) => ({
      id: p.id,
      testId: p.testId,
      testTitle: p.test?.title ?? '',
      candidateId: p.candidateId,
      candidateEmail: p.candidate?.email ?? '',
      candidateName: p.candidate?.username ?? null,
      amountCents: p.amountCents,
      status: p.status,
      createdAt: p.createdAt,
    }));
  }
}
