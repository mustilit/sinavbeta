// @ts-nocheck
import { IObjectionRepository } from '../../../domain/interfaces/IObjectionRepository';
import { Objection } from '../../../domain/entities/Objection';

/** Yükseltilmiş (ESCALATED) itirazları filtrelemek için kullanılan giriş tipi. */
export interface ListEscalatedFilters {
  /** Başlangıç tarihi (dahil). */
  from?: Date;
  /** Bitiş tarihi (dahil). */
  to?: Date;
}

/**
 * Yükseltilmiş itirazları listeler.
 * Sadece ESCALATED statüsündeki itirazlar döner; admin incelemesi için kullanılır.
 */
export class ListEscalatedObjectionsUseCase {
  constructor(private readonly objectionRepo: IObjectionRepository) {}

  /**
   * Opsiyonel tarih filtresi ile ESCALATED itirazları getirir.
   * @param filters - Tarih aralığı filtresi (opsiyonel).
   */
  async execute(filters?: ListEscalatedFilters): Promise<Objection[]> {
    return this.objectionRepo.listEscalated(filters);
  }
}
