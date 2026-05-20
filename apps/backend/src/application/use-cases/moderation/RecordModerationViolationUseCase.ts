import { Injectable } from '@nestjs/common';
import { ModerationCategory } from '@prisma/client';
import { prisma } from '../../../infrastructure/database/prisma';
import { IModerationViolationRepository } from '../../../domain/interfaces/IModerationViolationRepository';
import { IEducatorRiskScoreRepository } from '../../../domain/interfaces/IEducatorRiskScoreRepository';
import { IModerationActionRepository } from '../../../domain/interfaces/IModerationActionRepository';
import { RecomputeEducatorRiskScoreUseCase } from './RecomputeEducatorRiskScoreUseCase';

export interface RecordViolationParams {
  tenantId: string;
  userId: string;
  moderationResultId?: string | null;
  category: ModerationCategory;
  severity: number;
  entityType: string;
  entityId: string;
  adminNote?: string | null;
}

@Injectable()
export class RecordModerationViolationUseCase {
  private readonly recompute: RecomputeEducatorRiskScoreUseCase;

  constructor(
    private readonly violationRepo: IModerationViolationRepository,
    private readonly riskRepo: IEducatorRiskScoreRepository,
    private readonly actionRepo: IModerationActionRepository,
  ) {
    this.recompute = new RecomputeEducatorRiskScoreUseCase(
      riskRepo,
      violationRepo,
      actionRepo,
    );
  }

  async execute(params: RecordViolationParams) {
    const violation = await this.violationRepo.create({
      tenantId: params.tenantId,
      userId: params.userId,
      moderationResultId: params.moderationResultId ?? null,
      category: params.category,
      severity: params.severity,
      entityType: params.entityType,
      entityId: params.entityId,
      adminNote: params.adminNote ?? null,
    });

    // Risk skoru yeniden hesapla (best-effort, transaction dışında)
    await this.recompute.execute({
      userId: params.userId,
      tenantId: params.tenantId,
    });

    return violation;
  }
}
