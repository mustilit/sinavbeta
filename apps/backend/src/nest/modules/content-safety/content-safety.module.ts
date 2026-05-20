import { Module } from '@nestjs/common';
import { RedisCache } from '../../../infrastructure/cache/RedisCache';
import { PrismaBlockedTermRepository } from '../../../infrastructure/repositories/PrismaBlockedTermRepository';
import { PrismaModerationResultRepository } from '../../../infrastructure/repositories/PrismaModerationResultRepository';
import { PrismaModerationViolationRepository } from '../../../infrastructure/repositories/PrismaModerationViolationRepository';
import { PrismaModerationActionRepository } from '../../../infrastructure/repositories/PrismaModerationActionRepository';
import { PrismaEducatorRiskScoreRepository } from '../../../infrastructure/repositories/PrismaEducatorRiskScoreRepository';
import { BlocklistTextProvider } from '../../../application/services/content-safety/providers/BlocklistTextProvider';
import { NsfwjsImageProvider } from '../../../application/services/content-safety/providers/NsfwjsImageProvider';
import { ContentSafetyService } from '../../../application/services/content-safety/ContentSafetyService';
import { ModerationWorker } from './moderation.worker';
import { ProcessModerationJobUseCase } from '../../../application/use-cases/moderation/ProcessModerationJobUseCase';
import { ModerateQuestionContentUseCase } from '../../../application/use-cases/moderation/ModerateQuestionContentUseCase';
import { RecordModerationViolationUseCase } from '../../../application/use-cases/moderation/RecordModerationViolationUseCase';
import { RecomputeEducatorRiskScoreUseCase } from '../../../application/use-cases/moderation/RecomputeEducatorRiskScoreUseCase';
import { ListPendingModerationsUseCase } from '../../../application/use-cases/moderation/ListPendingModerationsUseCase';
import { GetModerationResultUseCase } from '../../../application/use-cases/moderation/GetModerationResultUseCase';
import { ApproveModerationUseCase } from '../../../application/use-cases/moderation/ApproveModerationUseCase';
import { RejectModerationUseCase } from '../../../application/use-cases/moderation/RejectModerationUseCase';
import { ListRiskyEducatorsUseCase } from '../../../application/use-cases/moderation/ListRiskyEducatorsUseCase';
import { GetEducatorViolationHistoryUseCase } from '../../../application/use-cases/moderation/GetEducatorViolationHistoryUseCase';
import { ApplyModerationActionUseCase } from '../../../application/use-cases/moderation/ApplyModerationActionUseCase';
import { RevokeModerationActionUseCase } from '../../../application/use-cases/moderation/RevokeModerationActionUseCase';
import { ListBlockedTermsUseCase } from '../../../application/use-cases/moderation/ListBlockedTermsUseCase';
import { CreateBlockedTermUseCase } from '../../../application/use-cases/moderation/CreateBlockedTermUseCase';
import { UpdateBlockedTermUseCase } from '../../../application/use-cases/moderation/UpdateBlockedTermUseCase';
import { DeleteBlockedTermUseCase } from '../../../application/use-cases/moderation/DeleteBlockedTermUseCase';
import { GetMyModerationStatusUseCase } from '../../../application/use-cases/moderation/GetMyModerationStatusUseCase';
import {
  BLOCKED_TERM_REPO,
  MODERATION_RESULT_REPO,
} from '../../../application/services/content-safety/types';

/**
 * ContentSafetyModule — içerik moderasyon servis + use case katmanı.
 *
 * Phase 3b: Use Case'ler, Worker ve Repository'ler dahil edildi.
 */
@Module({
  providers: [
    // Redis cache — BlocklistTextProvider için
    RedisCache,

    // Repository implementasyonları — tüm constructor injection'lar
    // tsx/esbuild metadata yayımlamadığı için açık factory ile.
    {
      provide: PrismaBlockedTermRepository,
      useFactory: (cache: RedisCache) => new PrismaBlockedTermRepository(cache),
      inject: [RedisCache],
    },
    {
      provide: BLOCKED_TERM_REPO,
      useExisting: PrismaBlockedTermRepository,
    },
    {
      provide: PrismaModerationResultRepository,
      useFactory: () => new PrismaModerationResultRepository(),
      inject: [],
    },
    {
      provide: MODERATION_RESULT_REPO,
      useExisting: PrismaModerationResultRepository,
    },
    {
      provide: PrismaModerationViolationRepository,
      useFactory: () => new PrismaModerationViolationRepository(),
      inject: [],
    },
    {
      provide: PrismaModerationActionRepository,
      useFactory: () => new PrismaModerationActionRepository(),
      inject: [],
    },
    {
      provide: PrismaEducatorRiskScoreRepository,
      useFactory: () => new PrismaEducatorRiskScoreRepository(),
      inject: [],
    },

    // Provider'lar
    {
      provide: BlocklistTextProvider,
      useFactory: (repo: PrismaBlockedTermRepository) =>
        new BlocklistTextProvider(repo),
      inject: [PrismaBlockedTermRepository],
    },
    NsfwjsImageProvider,

    // Orchestrator
    {
      provide: ContentSafetyService,
      useFactory: (
        blocklist: BlocklistTextProvider,
        nsfwjs: NsfwjsImageProvider,
      ) => new ContentSafetyService(blocklist, nsfwjs),
      inject: [BlocklistTextProvider, NsfwjsImageProvider],
    },

    // ── Use Case'ler ──────────────────────────────────────────────────────────

    {
      provide: RecomputeEducatorRiskScoreUseCase,
      useFactory: (
        riskRepo: PrismaEducatorRiskScoreRepository,
        violationRepo: PrismaModerationViolationRepository,
        actionRepo: PrismaModerationActionRepository,
      ) => new RecomputeEducatorRiskScoreUseCase(riskRepo, violationRepo, actionRepo),
      inject: [PrismaEducatorRiskScoreRepository, PrismaModerationViolationRepository, PrismaModerationActionRepository],
    },

    {
      provide: RecordModerationViolationUseCase,
      useFactory: (
        violationRepo: PrismaModerationViolationRepository,
        riskRepo: PrismaEducatorRiskScoreRepository,
        actionRepo: PrismaModerationActionRepository,
      ) => new RecordModerationViolationUseCase(violationRepo, riskRepo, actionRepo),
      inject: [PrismaModerationViolationRepository, PrismaEducatorRiskScoreRepository, PrismaModerationActionRepository],
    },

    {
      provide: ProcessModerationJobUseCase,
      useFactory: (
        violationRepo: PrismaModerationViolationRepository,
        riskRepo: PrismaEducatorRiskScoreRepository,
        actionRepo: PrismaModerationActionRepository,
      ) => new ProcessModerationJobUseCase(violationRepo, riskRepo, actionRepo),
      inject: [PrismaModerationViolationRepository, PrismaEducatorRiskScoreRepository, PrismaModerationActionRepository],
    },

    {
      provide: ModerateQuestionContentUseCase,
      useFactory: (
        contentSafety: ContentSafetyService,
        resultRepo: PrismaModerationResultRepository,
        violationRepo: PrismaModerationViolationRepository,
        riskRepo: PrismaEducatorRiskScoreRepository,
        actionRepo: PrismaModerationActionRepository,
      ) => new ModerateQuestionContentUseCase(
        contentSafety,
        resultRepo,
        violationRepo,
        riskRepo,
        actionRepo,
      ),
      inject: [
        ContentSafetyService,
        PrismaModerationResultRepository,
        PrismaModerationViolationRepository,
        PrismaEducatorRiskScoreRepository,
        PrismaModerationActionRepository,
      ],
    },

    // Worker — Redis yoksa onModuleInit sessizce geçer
    {
      provide: ModerationWorker,
      useFactory: (processJobUC: ProcessModerationJobUseCase) =>
        new ModerationWorker(processJobUC),
      inject: [ProcessModerationJobUseCase],
    },

    // Admin / sorgulama use case'leri
    ListPendingModerationsUseCase,
    GetModerationResultUseCase,

    {
      provide: ApproveModerationUseCase,
      useFactory: () => new ApproveModerationUseCase(),
      inject: [],
    },

    {
      provide: RejectModerationUseCase,
      useFactory: (
        violationRepo: PrismaModerationViolationRepository,
        riskRepo: PrismaEducatorRiskScoreRepository,
        actionRepo: PrismaModerationActionRepository,
      ) => new RejectModerationUseCase(violationRepo, riskRepo, actionRepo),
      inject: [PrismaModerationViolationRepository, PrismaEducatorRiskScoreRepository, PrismaModerationActionRepository],
    },

    ListRiskyEducatorsUseCase,

    {
      provide: GetEducatorViolationHistoryUseCase,
      useFactory: (riskRepo: PrismaEducatorRiskScoreRepository) =>
        new GetEducatorViolationHistoryUseCase(riskRepo),
      inject: [PrismaEducatorRiskScoreRepository],
    },

    {
      provide: ApplyModerationActionUseCase,
      useFactory: (actionRepo: PrismaModerationActionRepository) =>
        new ApplyModerationActionUseCase(actionRepo),
      inject: [PrismaModerationActionRepository],
    },

    {
      provide: RevokeModerationActionUseCase,
      useFactory: (actionRepo: PrismaModerationActionRepository) =>
        new RevokeModerationActionUseCase(actionRepo),
      inject: [PrismaModerationActionRepository],
    },

    // BlockedTerm CRUD
    {
      provide: ListBlockedTermsUseCase,
      useFactory: (repo: PrismaBlockedTermRepository) =>
        new ListBlockedTermsUseCase(repo),
      inject: [PrismaBlockedTermRepository],
    },

    {
      provide: CreateBlockedTermUseCase,
      useFactory: (repo: PrismaBlockedTermRepository) =>
        new CreateBlockedTermUseCase(repo),
      inject: [PrismaBlockedTermRepository],
    },

    {
      provide: UpdateBlockedTermUseCase,
      useFactory: (repo: PrismaBlockedTermRepository) =>
        new UpdateBlockedTermUseCase(repo),
      inject: [PrismaBlockedTermRepository],
    },

    {
      provide: DeleteBlockedTermUseCase,
      useFactory: (repo: PrismaBlockedTermRepository) =>
        new DeleteBlockedTermUseCase(repo),
      inject: [PrismaBlockedTermRepository],
    },

    {
      provide: GetMyModerationStatusUseCase,
      useFactory: (riskRepo: PrismaEducatorRiskScoreRepository) =>
        new GetMyModerationStatusUseCase(riskRepo),
      inject: [PrismaEducatorRiskScoreRepository],
    },
  ],
  exports: [
    ContentSafetyService,
    PrismaBlockedTermRepository,
    PrismaModerationResultRepository,
    PrismaModerationViolationRepository,
    PrismaModerationActionRepository,
    PrismaEducatorRiskScoreRepository,
    BLOCKED_TERM_REPO,
    MODERATION_RESULT_REPO,
    ModerateQuestionContentUseCase,
    ProcessModerationJobUseCase,
    RecordModerationViolationUseCase,
    RecomputeEducatorRiskScoreUseCase,
    ListPendingModerationsUseCase,
    GetModerationResultUseCase,
    ApproveModerationUseCase,
    RejectModerationUseCase,
    ListRiskyEducatorsUseCase,
    GetEducatorViolationHistoryUseCase,
    ApplyModerationActionUseCase,
    RevokeModerationActionUseCase,
    ListBlockedTermsUseCase,
    CreateBlockedTermUseCase,
    UpdateBlockedTermUseCase,
    DeleteBlockedTermUseCase,
    GetMyModerationStatusUseCase,
  ],
})
export class ContentSafetyModule {}
