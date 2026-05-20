import { ModerationActionType } from '@prisma/client';

export interface ModerationActionRecord {
  id: string;
  tenantId: string;
  userId: string;
  actorId: string | null;
  actionType: ModerationActionType;
  reason: string | null;
  metadata: unknown;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateModerationActionData {
  tenantId: string;
  userId: string;
  actorId?: string | null;
  actionType: ModerationActionType;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | null;
}

export interface IModerationActionRepository {
  create(data: CreateModerationActionData): Promise<ModerationActionRecord>;

  findById(id: string): Promise<ModerationActionRecord | null>;

  findByUser(
    userId: string,
    tenantId: string,
    opts?: { limit?: number },
  ): Promise<ModerationActionRecord[]>;

  /** Süresi dolmamış aktif askıya alma aksiyonunu bul */
  findActivesuspension(
    userId: string,
    tenantId: string,
  ): Promise<ModerationActionRecord | null>;
}
