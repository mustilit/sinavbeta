// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { ITestPackageRepository } from '../../../domain/interfaces/ITestPackageRepository';

export class UnpublishTestPackageUseCase {
  constructor(private readonly repo: ITestPackageRepository) {}

  async execute(packageId: string, educatorId: string) {
    const pkg = await this.repo.findById(packageId);

    if (!pkg) {
      throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    }

    if (pkg.educatorId !== educatorId) {
      throw new AppError('FORBIDDEN', 'Bu paketi yayından kaldırma yetkiniz yok', 403);
    }

    if (pkg.publishedAt === null) {
      throw new AppError('NOT_PUBLISHED', 'Paket zaten yayında değil', 409);
    }

    return this.repo.unpublish(packageId);
  }
}
