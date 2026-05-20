// @ts-nocheck
import { IObjectionRepository, EnrichedObjection } from '../../../domain/interfaces/IObjectionRepository';

/**
 * Bir eğiticinin testlerine yapılan itirazları listeler.
 * Eğitici paneli "Hata Bildirimleri" sayfasında görüntülenir.
 */
export class ListEducatorObjectionsUseCase {
  constructor(private readonly objectionRepo: IObjectionRepository) {}

  async execute(educatorId: string, filters?: { status?: string }): Promise<EnrichedObjection[]> {
    return this.objectionRepo.listByEducator(educatorId, filters);
  }
}
