import { EducatorRiskLevel } from '@prisma/client';

export interface EducatorRiskScoreRecord {
  id: string;
  tenantId: string;
  userId: string;
  riskLevel: EducatorRiskLevel;
  computedScore: number;
  violationCount: number;
  openViolations: number;
  highSeverityCount: number;
  lastViolationAt: Date | null;
  lastComputedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertRiskScoreData {
  tenantId: string;
  userId: string;
  riskLevel: EducatorRiskLevel;
  computedScore: number;
  violationCount: number;
  openViolations: number;
  highSeverityCount: number;
  lastViolationAt?: Date | null;
}

export interface IEducatorRiskScoreRepository {
  upsert(data: UpsertRiskScoreData): Promise<EducatorRiskScoreRecord>;

  findByUser(
    userId: string,
    tenantId: string,
  ): Promise<EducatorRiskScoreRecord | null>;

  listRisky(opts: {
    tenantId: string;
    riskLevels?: EducatorRiskLevel[];
    cursor?: { computedScore: number; userId: string };
    limit: number;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<EducatorRiskScoreRecord[]>;

  /** Son 24 saatte ihlal alan educator userId listesi */
  findRecentlyViolated(
    tenantId: string,
    since: Date,
  ): Promise<string[]>;
}
