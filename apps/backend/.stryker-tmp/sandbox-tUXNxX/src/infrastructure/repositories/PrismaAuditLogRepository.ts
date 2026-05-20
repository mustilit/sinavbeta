// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../domain/entities/AuditLog';
import { CreateAuditLogInput, IAuditLogRepository, ListAuditLogsFilters } from '../../domain/interfaces/IAuditLogRepository';
import type { AuditAction as PrismaAuditAction } from '@prisma/client';
import { prisma } from '../database/prisma';

/** Uygulama alias'larını Prisma enum değerine map et (DB yazarken) */
const ACTION_MAP: Record<string, PrismaAuditAction> = {
  REFUND: 'REFUND_REQUESTED',
  PRICE_CHANGE: 'PRICE_CHANGED',
  PUBLISH: 'TEST_PUBLISHED',
  UNPUBLISH: 'TEST_UNPUBLISHED',
  SUBMIT_ANSWER: 'SUBMIT_ATTEMPT',
};

@Injectable()
export class PrismaAuditLogRepository implements IAuditLogRepository {
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const action = (ACTION_MAP[input.action] ?? input.action) as PrismaAuditAction;
    const created = await prisma.auditLog.create({
      data: {
        action,
        entityType: input.entityType,
        entityId: input.entityId,
        actorId: input.actorId ?? null,
        metadata: (input.metadata ?? {}) as object,
      },
    });
    return this.toDomain(created);
  }

  async list(filters?: ListAuditLogsFilters): Promise<{ items: AuditLog[]; total: number }> {
    const where: any = {};
    if (filters?.action) where.action = filters.action;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.actorId) where.actorId = filters.actorId;
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from;
      if (filters.to) where.createdAt.lte = filters.to;
    }
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters?.limit ?? 50));
    const skip = (page - 1) * limit;
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  private toDomain(row: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorId: string | null;
    metadata: unknown;
    createdAt: Date;
  }): AuditLog {
    return {
      id: row.id,
      action: row.action as AuditLog['action'],
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt,
    };
  }
}
