// @ts-nocheck
import { Injectable, Inject } from '@nestjs/common';
import { IExamTypeRepository } from '../../../domain/interfaces/IExamTypeRepository';
import { EXAM_TYPE_REPO } from '../../constants';

/**
 * Sınav türlerini listeler.
 * Varsayılan olarak yalnızca aktif sınav türleri döner.
 */
@Injectable()
export class ListExamTypesUseCase {
  constructor(@Inject(EXAM_TYPE_REPO) private readonly repo: IExamTypeRepository) {}

  /**
   * Sınav türlerini getirir.
   * @param activeOnly - Sadece aktif sınav türleri dönsün mü? Varsayılan: true.
   */
  async execute(activeOnly = true) {
    return this.repo.list({ activeOnly });
  }
}

