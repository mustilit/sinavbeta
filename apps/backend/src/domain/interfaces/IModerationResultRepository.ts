import { ModerationCategory, ModerationProvider, ModerationStatus } from '@prisma/client';

export interface ModerationResultRecord {
  id: string;
  tenantId: string;
  userId: string;
  entityType: string;
  entityId: string;
  provider: ModerationProvider;
  status: ModerationStatus;
  score: number | null;
  categories: ModerationCategory[];
  flaggedContent: string | null;
  reviewerNote: string | null;
  rawResponse: unknown | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface CreateModerationResultData {
  tenantId: string;
  userId: string;
  entityType: string;
  entityId: string;
  provider: ModerationProvider;
  status: ModerationStatus;
  score?: number | null;
  categories?: ModerationCategory[];
  flaggedContent?: string | null;
  rawResponse?: unknown | null;
}

export interface IModerationResultRepository {
  create(data: CreateModerationResultData): Promise<ModerationResultRecord>;

  findById(id: string): Promise<ModerationResultRecord | null>;

  updateStatus(
    id: string,
    status: ModerationStatus,
    reviewerNote?: string,
  ): Promise<ModerationResultRecord>;

  findByEntity(entityType: string, entityId: string): Promise<ModerationResultRecord[]>;
}
