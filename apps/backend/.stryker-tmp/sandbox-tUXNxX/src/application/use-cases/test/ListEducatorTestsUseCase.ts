// @ts-nocheck
import { IExamRepository } from '../../../domain/interfaces/IExamRepository';
import { AppError } from '../../errors/AppError';

/** Eğiticinin kendi test paketlerini listeler (yayında + taslak dahil). */
export class ListEducatorTestsUseCase {
  constructor(private readonly examRepository: IExamRepository) {}

  async execute(educatorId: string) {
    if (!educatorId) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    return this.examRepository.findByEducatorId(educatorId);
  }
}
