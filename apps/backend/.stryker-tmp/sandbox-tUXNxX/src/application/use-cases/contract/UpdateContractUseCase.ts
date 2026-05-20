// @ts-nocheck
import type { IContractRepository } from '../../../domain/interfaces/IContractRepository';
import { AppError } from '../../errors/AppError';

/**
 * Mevcut sözleşmeyi günceller. Sadece gönderilen alanlar değiştirilir (partial update).
 * title/content trim edilir — önde/arkadaki boşluklar normalize edilir.
 */
export class UpdateContractUseCase {
  constructor(private readonly contractRepo: IContractRepository) {}

  async execute(id: string, input: { title?: string; content?: string; isActive?: boolean }) {
    const existing = await this.contractRepo.getById(id);
    if (!existing) throw new AppError('NOT_FOUND', 'Contract not found', 404);

    const data: { title?: string; content?: string; isActive?: boolean } = {};
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.content !== undefined) data.content = input.content.trim();
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return this.contractRepo.update(id, data);
  }
}
