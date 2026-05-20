// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { ITestPackageRepository } from '../../../domain/interfaces/ITestPackageRepository';

export class GetTestPackageUseCase {
  constructor(private readonly repo: ITestPackageRepository) {}

  async execute(packageId: string, requesterId: string) {
    const pkg = await this.repo.findByIdWithTests(packageId);

    if (!pkg) {
      throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    }

    // Owner kontrolü: sadece sahibi görebilir (yayınlanmamış paketler dahil)
    if (pkg.educatorId !== requesterId) {
      throw new AppError('FORBIDDEN', 'Bu pakete erişim yetkiniz yok', 403);
    }

    return pkg;
  }
}
