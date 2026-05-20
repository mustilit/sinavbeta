// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { ITestPackageRepository } from '../../../domain/interfaces/ITestPackageRepository';
import { prisma } from '../../../infrastructure/database/prisma';

export class RemoveTestFromPackageUseCase {
  constructor(private readonly repo: ITestPackageRepository) {}

  async execute(packageId: string, educatorId: string, testId: string) {
    const pkg = await this.repo.findById(packageId);

    if (!pkg) {
      throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    }

    if (pkg.educatorId !== educatorId) {
      throw new AppError('FORBIDDEN', 'Bu paketi düzenleme yetkiniz yok', 403);
    }

    // Test bu pakette mi?
    const test = await prisma.examTest.findUnique({
      where: { id: testId },
      select: { id: true, packageId: true },
    });

    if (!test || test.packageId !== packageId) {
      throw new AppError('TEST_NOT_IN_PACKAGE', 'Test bu pakette değil', 404);
    }

    await this.repo.removeTest(packageId, testId);
    return { success: true };
  }
}
