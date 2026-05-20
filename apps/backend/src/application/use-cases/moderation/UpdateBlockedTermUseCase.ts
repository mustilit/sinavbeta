import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { IBlockedTermRepository } from '../../../domain/interfaces/IBlockedTermRepository';
import { AppError } from '../../errors/AppError';

export interface UpdateBlockedTermParams {
  id: string;
  tenantId: string;
  term?: string;
  pattern?: string | null;
  category?: ModerationCategory;
  severity?: number;
  isActive?: boolean;
}

@Injectable()
export class UpdateBlockedTermUseCase {
  constructor(private readonly repo: IBlockedTermRepository) {}

  async execute(params: UpdateBlockedTermParams) {
    const existing = await this.repo.findById(params.id);
    if (!existing) {
      throw new AppError('BLOCKED_TERM_NOT_FOUND', 'Yasaklı terim bulunamadı', 404);
    }
    if (existing.tenantId !== params.tenantId) {
      throw new AppError('FORBIDDEN', 'Bu terimi düzenleme yetkiniz yok', 403);
    }

    const result = await this.repo.update(params.id, {
      ...(params.term !== undefined && { term: params.term.trim().toLowerCase() }),
      ...(params.pattern !== undefined && { pattern: params.pattern }),
      ...(params.category !== undefined && { category: params.category }),
      ...(params.severity !== undefined && { severity: params.severity }),
      ...(params.isActive !== undefined && { isActive: params.isActive }),
    });

    await this.repo.invalidateCache(params.tenantId);
    return result;
  }
}
