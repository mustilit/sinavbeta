// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { ITestPackageRepository } from '../../../domain/interfaces/ITestPackageRepository';
import { prisma } from '../../../infrastructure/database/prisma';

export class PublishTestPackageUseCase {
  constructor(private readonly repo: ITestPackageRepository) {}

  async execute(packageId: string, educatorId: string) {
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    if (settings && (settings as any).testPublishingEnabled === false) {
      throw new AppError('PUBLISHING_DISABLED', 'Yayınlama geçici olarak durdurulmuştur', 503);
    }

    const pkg = await this.repo.findByIdWithTests(packageId);

    if (!pkg) {
      throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    }

    if (pkg.educatorId !== educatorId) {
      throw new AppError('FORBIDDEN', 'Bu paketi yayınlama yetkiniz yok', 403);
    }

    if (pkg.publishedAt !== null) {
      throw new AppError('ALREADY_PUBLISHED', 'Paket zaten yayınlanmış', 409);
    }

    if (!pkg.tests || pkg.tests.length === 0) {
      throw new AppError('PACKAGE_EMPTY', 'Yayınlamak için pakette en az bir test olmalı', 400);
    }

    if (!pkg.priceCents || pkg.priceCents <= 0) {
      throw new AppError('INVALID_PRICE', 'Ücretsiz paket yayınlanamaz. Lütfen bir fiyat belirleyin.', 400);
    }

    return this.repo.publish(packageId);
  }
}
