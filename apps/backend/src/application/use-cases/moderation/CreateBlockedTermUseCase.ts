import { Injectable } from '@nestjs/common';
import { ModerationCategory, Prisma } from '@prisma/client';
import { IBlockedTermRepository } from '../../../domain/interfaces/IBlockedTermRepository';
import { AppError } from '../../errors/AppError';

export interface CreateBlockedTermParams {
  tenantId: string;
  term: string;
  pattern?: string | null;
  category: ModerationCategory;
  severity?: number;
  isActive?: boolean;
  createdBy: string;
}

@Injectable()
export class CreateBlockedTermUseCase {
  constructor(private readonly repo: IBlockedTermRepository) {}

  async execute(params: CreateBlockedTermParams) {
    const term = params.term.trim().toLowerCase();
    if (!term) {
      throw new AppError('VALIDATION_ERROR', 'Kelime boş olamaz', 400);
    }
    try {
      const result = await this.repo.create({
        tenantId: params.tenantId,
        term,
        pattern: params.pattern ?? null,
        category: params.category,
        severity: params.severity ?? 1,
        isActive: params.isActive ?? true,
        createdBy: params.createdBy,
      });

      await this.repo.invalidateCache(params.tenantId);
      return result;
    } catch (err: any) {
      // Prisma unique constraint violation (tenantId, term)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(
          'DUPLICATE_BLOCKED_TERM',
          'Bu kelime zaten yasak listesinde kayıtlı',
          409,
        );
      }
      throw err;
    }
  }
}
