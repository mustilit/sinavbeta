import { AppError } from '../../errors/AppError';
import { ITestPackageRepository } from '../../../domain/interfaces/ITestPackageRepository';
import { normalizeExamLanguage } from '../../../common/examLanguages';

export class UpdateTestPackageUseCase {
  constructor(private readonly repo: ITestPackageRepository) {}

  async execute(packageId: string, educatorId: string, input: {
    title?: string;
    description?: string | null;
    priceCents?: number;
    language?: string;
    coverImageUrl?: string | null;
  }) {
    const pkg = await this.repo.findById(packageId);

    if (!pkg) {
      throw new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı', 404);
    }

    if (pkg.educatorId !== educatorId) {
      throw new AppError('FORBIDDEN', 'Bu paketi düzenleme yetkiniz yok', 403);
    }

    if (input.title !== undefined && input.title.trim().length === 0) {
      throw new AppError('INVALID_TITLE', 'Paket başlığı boş olamaz', 400);
    }

    if (input.priceCents !== undefined && input.priceCents < 0) {
      throw new AppError('INVALID_PRICE', 'Fiyat negatif olamaz', 400);
    }

    return this.repo.update(packageId, {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
      ...(input.language !== undefined && { language: normalizeExamLanguage(input.language) }),
      ...(input.coverImageUrl !== undefined && { coverImageUrl: input.coverImageUrl }),
    });
  }
}
