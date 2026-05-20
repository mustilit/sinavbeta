import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { IBlockedTermRepository } from '../../../domain/interfaces/IBlockedTermRepository';

export interface ListBlockedTermsParams {
  tenantId: string;
  cursor?: { id: string };
  limit?: number;
  category?: ModerationCategory;
  isActive?: boolean;
  /** Term substring araması (case-insensitive) */
  term?: string;
}

@Injectable()
export class ListBlockedTermsUseCase {
  constructor(private readonly repo: IBlockedTermRepository) {}

  async execute(params: ListBlockedTermsParams) {
    const { prisma } = await import('../../../infrastructure/database/prisma');
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const take = limit + 1;

    const trimmedTerm = params.term?.trim();
    const rows = await prisma.blockedTerm.findMany({
      where: {
        tenantId: params.tenantId,
        ...(params.category && { category: params.category }),
        ...(params.isActive !== undefined && { isActive: params.isActive }),
        ...(trimmedTerm && { term: { contains: trimmedTerm, mode: 'insensitive' as const } }),
      },
      select: {
        id: true,
        tenantId: true,
        term: true,
        pattern: true,
        category: true,
        severity: true,
        isActive: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(params.cursor && {
        cursor: { id: params.cursor.id },
        skip: 1,
      }),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, -1) : rows;

    return {
      items,
      nextCursor: hasMore ? { id: items[items.length - 1].id } : null,
    };
  }
}
