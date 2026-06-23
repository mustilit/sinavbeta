import { prisma } from '../../../infrastructure/database/prisma';
import { AppError } from '../../errors/AppError';
import { ensureEducatorActive } from '../../policies/ensureEducatorActive';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';

/** FR-E-07: Eğitici satın aldığı reklamları listeler */
export class ListEducatorAdPurchasesUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(educatorId: string) {
    const user = await this.userRepo.findById(educatorId);
    if (!user) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    ensureEducatorActive(user);

    const items = await prisma.adPurchase.findMany({
      where: { educatorId },
      include: { adPackage: true, test: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // WRITTEN hedefli reklamlar için yazılı paket başlıklarını çöz (scalar — relation YOK)
    const writtenIds = items
      .map((p) => (p as any).writtenPackageId as string | null)
      .filter((id): id is string => !!id);
    const writtenById = new Map<string, { id: string; title: string }>();
    if (writtenIds.length > 0) {
      const pkgs = await prisma.writtenPackage.findMany({
        where: { id: { in: writtenIds } },
        select: { id: true, title: true },
      });
      for (const w of pkgs) writtenById.set(w.id, w);
    }

    return items.map((p) => ({
      id: p.id,
      adPackage: { id: p.adPackage.id, name: p.adPackage.name },
      targetType: (p as any).targetType,
      test: p.test,
      writtenPackage: (p as any).writtenPackageId ? writtenById.get((p as any).writtenPackageId) ?? null : null,
      validUntil: p.validUntil,
      impressionsRemaining: p.impressionsRemaining,
      createdAt: p.createdAt,
    }));
  }
}
