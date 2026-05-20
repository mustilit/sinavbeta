// @ts-nocheck
import { AppError } from '../../errors/AppError';
import { ITestPackageRepository } from '../../../domain/interfaces/ITestPackageRepository';
import { prisma } from '../../../infrastructure/database/prisma';

export class AddTestToPackageUseCase {
  constructor(private readonly repo: ITestPackageRepository) {}

  async execute(packageId: string, educatorId: string, testId: string) {
    const pkg = await this.repo.findByIdWithTests(packageId);

    if (!pkg) {
      throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    }

    if (pkg.educatorId !== educatorId) {
      throw new AppError('FORBIDDEN', 'Bu paketi düzenleme yetkiniz yok', 403);
    }

    // Test var mı ve bu eğiticiye mi ait?
    const test = await prisma.examTest.findUnique({
      where: { id: testId },
      select: { id: true, educatorId: true, packageId: true },
    });

    if (!test) {
      throw new AppError('TEST_NOT_FOUND', 'Test bulunamadı', 404);
    }

    if (test.educatorId !== educatorId) {
      throw new AppError('FORBIDDEN', 'Bu testi pakete ekleme yetkiniz yok', 403);
    }

    if (test.packageId && test.packageId !== packageId) {
      throw new AppError('TEST_ALREADY_IN_PACKAGE', 'Test zaten başka bir pakette', 409);
    }

    if (test.packageId === packageId) {
      throw new AppError('TEST_ALREADY_IN_PACKAGE', 'Test zaten bu pakette', 409);
    }

    // maxTestsPerPackage admin ayarı kontrolü
    const settings = await prisma.adminSettings.findFirst({ where: { id: 1 } });
    const maxTests = settings?.maxTestsPerPackage ?? 10;
    const currentCount = pkg.tests?.length ?? 0;

    if (currentCount >= maxTests) {
      throw new AppError(
        'PACKAGE_FULL',
        `Pakete en fazla ${maxTests} test eklenebilir`,
        400,
      );
    }

    await this.repo.addTest(packageId, testId);
    return this.repo.findByIdWithTests(packageId);
  }
}
