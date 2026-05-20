// @ts-nocheck
import { AuditLog } from '../entities/AuditLog';
import { ExtendedAuditAction } from '../types';

export interface CreateAuditLogInput {
  action: ExtendedAuditAction;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ListAuditLogsFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export interface IAuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLog>;
  list(filters?: ListAuditLogsFilters): Promise<{ items: AuditLog[]; total: number }>;
}
