import { Injectable } from '@nestjs/common';
import { IBlockedTermRepository } from '../../../domain/interfaces/IBlockedTermRepository';
import { AppError } from '../../errors/AppError';

@Injectable()
export class DeleteBlockedTermUseCase {
  constructor(private readonly repo: IBlockedTermRepository) {}

  async execute(id: string, tenantId: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppError('BLOCKED_TERM_NOT_FOUND', 'Yasaklı terim bulunamadı', 404);
    }
    if (existing.tenantId !== tenantId) {
      throw new AppError('FORBIDDEN', 'Bu terimi silme yetkiniz yok', 403);
    }

    await this.repo.delete(id);
    await this.repo.invalidateCache(tenantId);
  }
}
