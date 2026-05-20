// @ts-nocheck
import { IObjectionRepository, EnrichedObjection } from '../../../domain/interfaces/IObjectionRepository';

/**
 * Tüm itirazları listeler — admin ve eğitici paneli için.
 * Durum ve tarih aralığına göre filtreleme desteklenir.
 */
export class ListAllObjectionsUseCase {
  constructor(private readonly objectionRepo: IObjectionRepository) {}

  async execute(filters?: { status?: string; from?: Date; to?: Date }): Promise<EnrichedObjection[]> {
    return this.objectionRepo.listAll(filters);
  }
}
