// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { prisma } from '../../../infrastructure/database/prisma';
import { ITestPackageRepository } from '../../../domain/interfaces/ITestPackageRepository';
import { getDefaultTenantId } from '../../../common/tenant';

export class CreateTestPackageUseCase {
  constructor(private readonly repo: ITestPackageRepository) {}

  async execute(educatorId: string, input: {
    title: string;
    description?: string | null;
    priceCents: number;
    difficulty?: string;
  }) {
    // Kill-switch kontrolü
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    if (settings && settings.packageCreationEnabled === false) {
      throw new AppError('PACKAGE_CREATION_DISABLED', 'Paket oluşturma geçici olarak durdurulmuştur', 503);
    }

    if (!input.title || input.title.trim().length === 0) {
      throw new AppError('INVALID_TITLE', 'Paket başlığı boş olamaz', 400);
    }

    // minPackagePriceCents Prisma client'ta olmayabilir; raw okuma güvenli yol
    const rawMin = await (prisma as any).$queryRaw<{ minPackagePriceCents: number }[]>`
      SELECT "minPackagePriceCents" FROM admin_settings WHERE id = 1
    `;
    const minPriceCents = rawMin[0]?.minPackagePriceCents ?? 100;
    if (input.priceCents < minPriceCents) {
      const minTL = (minPriceCents / 100).toFixed(2).replace('.', ',');
      throw new AppError('PRICE_TOO_LOW', `Paket fiyatı en az ${minTL} ₺ olmalıdır`, 400);
    }

    // Educator'ın tenant'ını bul
    const educator = await prisma.user.findUnique({ where: { id: educatorId }, select: { tenantId: true } });
    const tenantId = educator?.tenantId ?? getDefaultTenantId();

    const validDifficulties = ['easy', 'medium', 'hard'];
    const difficulty = input.difficulty && validDifficulties.includes(input.difficulty)
      ? input.difficulty
      : 'medium';

    return this.repo.create({
      tenantId,
      educatorId,
      title: input.title.trim(),
      description: input.description ?? null,
      priceCents: input.priceCents,
      difficulty,
    });
  }
}
