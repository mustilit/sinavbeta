// @ts-nocheck
import { AuditLog } from '../../domain/entities/AuditLog';
import { CreateAuditLogInput, IAuditLogRepository, ListAuditLogsFilters } from '../../domain/interfaces/IAuditLogRepository';
import { randomUUID } from 'crypto';

/**
 * In-memory Audit Log Repository - geliştirme/test
 */
export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private logs: AuditLog[] = [];

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const log: AuditLog = {
      id: randomUUID(),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    };
    this.logs.push(log);
    return log;
  }

  async list(filters?: ListAuditLogsFilters): Promise<{ items: AuditLog[]; total: number }> {
    let items = [...this.logs];
    if (filters?.action) items = items.filter((l) => l.action === filters.action);
    if (filters?.entityType) items = items.filter((l) => l.entityType === filters.entityType);
    if (filters?.entityId) items = items.filter((l) => l.entityId === filters.entityId);
    if (filters?.actorId) items = items.filter((l) => l.actorId === filters.actorId);
    if (filters?.from) items = items.filter((l) => l.createdAt >= filters.from!);
    if (filters?.to) items = items.filter((l) => l.createdAt <= filters.to!);
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = items.length;
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters?.limit ?? 50));
    const skip = (page - 1) * limit;
    items = items.slice(skip, skip + limit);
    return { items, total };
  }
}
