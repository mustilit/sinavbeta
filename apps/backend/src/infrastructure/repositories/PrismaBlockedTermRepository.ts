import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { prisma } from '../database/prisma';
import { RedisCache } from '../cache/RedisCache';
import {
  BlockedTermRecord,
  IBlockedTermRepository,
} from '../../domain/interfaces/IBlockedTermRepository';

const CACHE_TTL_SECONDS = 60;
const cacheKey = (tenantId: string) => `blocked_terms:${tenantId}`;

const BLOCKED_TERM_SELECT = {
  id: true,
  tenantId: true,
  term: true,
  pattern: true,
  category: true,
  severity: true,
  isActive: true,
  createdBy: true,
} as const;

@Injectable()
export class PrismaBlockedTermRepository implements IBlockedTermRepository {
  constructor(private readonly cache: RedisCache) {}

  async findActiveByTenant(tenantId: string): Promise<BlockedTermRecord[]> {
    const cached = await this.cache.get<BlockedTermRecord[]>(cacheKey(tenantId));
    if (cached) return cached;

    const rows = await prisma.blockedTerm.findMany({
      where: { tenantId, isActive: true },
      select: BLOCKED_TERM_SELECT,
    });

    await this.cache.set(cacheKey(tenantId), rows, CACHE_TTL_SECONDS);
    return rows;
  }

  async findById(id: string): Promise<BlockedTermRecord | null> {
    return prisma.blockedTerm.findUnique({
      where: { id },
      select: BLOCKED_TERM_SELECT,
    });
  }

  async create(data: {
    tenantId: string;
    term: string;
    pattern?: string | null;
    category: ModerationCategory;
    severity?: number;
    isActive?: boolean;
    createdBy?: string | null;
  }): Promise<BlockedTermRecord> {
    const row = await prisma.blockedTerm.create({
      data: {
        tenantId: data.tenantId,
        term: data.term,
        pattern: data.pattern ?? null,
        category: data.category,
        severity: data.severity ?? 1,
        isActive: data.isActive ?? true,
        createdBy: data.createdBy ?? null,
      },
      select: BLOCKED_TERM_SELECT,
    });
    await this.invalidateCache(data.tenantId);
    return row;
  }

  async update(
    id: string,
    data: Partial<{
      term: string;
      pattern: string | null;
      category: ModerationCategory;
      severity: number;
      isActive: boolean;
    }>,
  ): Promise<BlockedTermRecord> {
    const row = await prisma.blockedTerm.update({
      where: { id },
      data,
      select: BLOCKED_TERM_SELECT,
    });
    await this.invalidateCache(row.tenantId);
    return row;
  }

  async delete(id: string): Promise<void> {
    const row = await prisma.blockedTerm.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    await prisma.blockedTerm.delete({ where: { id } });
    if (row) await this.invalidateCache(row.tenantId);
  }

  async invalidateCache(tenantId: string): Promise<void> {
    await this.cache.del(cacheKey(tenantId));
  }
}
