import { ModerationCategory } from '@prisma/client';

export interface ModerationViolationRecord {
  id: string;
  tenantId: string;
  userId: string;
  moderationResultId: string | null;
  category: ModerationCategory;
  severity: number;
  status: string;
  entityType: string;
  entityId: string;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface CreateModerationViolationData {
  tenantId: string;
  userId: string;
  moderationResultId?: string | null;
  category: ModerationCategory;
  severity: number;
  entityType: string;
  entityId: string;
  adminNote?: string | null;
}

export interface IModerationViolationRepository {
  create(data: CreateModerationViolationData): Promise<ModerationViolationRecord>;

  findById(id: string): Promise<ModerationViolationRecord | null>;

  findByUser(
    userId: string,
    opts?: { limit?: number; sinceDate?: Date },
  ): Promise<ModerationViolationRecord[]>;

  findByModerationResult(
    moderationResultId: string,
  ): Promise<ModerationViolationRecord | null>;

  updateStatus(
    id: string,
    status: string,
    reviewedBy?: string,
    adminNote?: string,
  ): Promise<ModerationViolationRecord>;

  markResolved(id: string): Promise<ModerationViolationRecord>;

  /** Son 90 gün içindeki OPEN ihlaller — risk skoru hesabı için */
  findOpenByUser(
    userId: string,
    tenantId: string,
    since?: Date,
  ): Promise<ModerationViolationRecord[]>;
}
