import { Module } from '@nestjs/common';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import IORedis from 'ioredis';
import { APP_GUARD } from '@nestjs/core';
import { CustomThrottlerGuard } from './guards/throttler.guard';
import { TestsController } from './controllers/tests.controller';
import { RootController } from './controllers/root.controller';
import { HealthController } from './controllers/health.controller';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ExamTypesModule } from './modules/exam-types/exam-types.module';
import { TestsModule } from './modules/tests/tests.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { AttemptsModule } from './modules/attempts/attempts.module';
import { AuditModule } from './modules/audit/audit.module';
import { CronModule } from './modules/cron/cron.module';
import { NotificationsController } from './controllers/notifications.controller';
import { AdminDlqController } from './controllers/admin.dlq.controller';
import { TestsPerformanceController } from './controllers/tests.performance.controller';
import { HomeController } from './controllers/home.controller';
import { ReviewsController } from './controllers/reviews.controller';
import { EducatorsController } from './controllers/educators.controller';
import { FollowsController } from './controllers/follows.controller';
import { CspReportController } from './controllers/csp-report.controller';
import { AdminExamTypesController } from './controllers/admin.exam-types.controller';
import { AdminTopicsController } from './controllers/admin.topics.controller';
import { AdminEducatorsController } from './controllers/admin.educators.controller';
import { ObjectionsController } from './controllers/objections.controller';
import { EducatorObjectionsController } from './controllers/educator-objections.controller';
import { AdminObjectionsController } from './controllers/admin.objections.controller';
import { AdminRefundsController } from './controllers/admin.refunds.controller';
import { AdminSettingsController } from './controllers/admin.settings.controller';
import { AdminSiteSettingsController } from './controllers/admin.site-settings.controller';
import { SiteController } from './controllers/site.controller';
import { AdminContractsController } from './controllers/admin.contracts.controller';
import { AdminAuditController } from './controllers/admin.audit.controller';
import { AdminAdPackagesController } from './controllers/admin.ad-packages.controller';
import { AdPackagesController } from './controllers/ad-packages.controller';
import { MeRefundsController } from './controllers/me.refunds.controller';
import { MePurchasesController } from './controllers/me.purchases.controller';
import { MePreferencesController } from './controllers/me.preferences.controller';
import { AdminUsersController } from './controllers/admin.users.controller';
import { SeedService } from './bootstrap/seed.service';
import { PrismaExamTypeRepository } from '../infrastructure/repositories/PrismaExamTypeRepository';
import { PrismaAuditLogRepository } from '../infrastructure/repositories/PrismaAuditLogRepository';
import { PrismaTopicRepository } from '../infrastructure/repositories/PrismaTopicRepository';
import { ListExamTypesUseCase } from '../application/use-cases/ListExamTypesUseCase';
import { CreateExamTypeUseCase } from '../application/use-cases/CreateExamTypeUseCase';
import { UpdateExamTypeUseCase } from '../application/use-cases/UpdateExamTypeUseCase';
import { DeleteExamTypeUseCase } from '../application/use-cases/DeleteExamTypeUseCase';
import { ListTopicsByExamTypeUseCase } from '../application/use-cases/ListTopicsByExamTypeUseCase';
import { CreateTopicUseCase } from '../application/use-cases/CreateTopicUseCase';
import { UpdateTopicUseCase } from '../application/use-cases/UpdateTopicUseCase';
import { DeleteTopicUseCase } from '../application/use-cases/DeleteTopicUseCase';
import { GetTopicTreeUseCase } from '../application/use-cases/GetTopicTreeUseCase';
import { ApproveEducatorUseCase } from '../application/use-cases/educator/ApproveEducatorUseCase';
import { SuspendEducatorUseCase } from '../application/use-cases/educator/SuspendEducatorUseCase';
import { UnsuspendEducatorUseCase } from '../application/use-cases/educator/UnsuspendEducatorUseCase';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { PrismaObjectionRepository } from '../infrastructure/repositories/PrismaObjectionRepository';
import { PrismaAttemptRepository } from '../infrastructure/repositories/PrismaAttemptRepository';
import { PrismaExamRepository } from '../infrastructure/repositories/PrismaExamRepository';
import { getRedisUrl } from '../config/redis';
import { CreateObjectionUseCase } from '../application/use-cases/CreateObjectionUseCase';
import { AnswerObjectionUseCase } from '../application/use-cases/AnswerObjectionUseCase';
import { ListEscalatedObjectionsUseCase } from '../application/use-cases/ListEscalatedObjectionsUseCase';
import { ListEducatorObjectionsUseCase } from '../application/use-cases/ListEducatorObjectionsUseCase';
import { ListAllObjectionsUseCase } from '../application/use-cases/ListAllObjectionsUseCase';
import { ListTestReportStatsUseCase } from '../application/use-cases/ListTestReportStatsUseCase';
import { ApproveRefundUseCase } from '../application/use-cases/ApproveRefundUseCase';
import { RejectRefundUseCase } from '../application/use-cases/RejectRefundUseCase';
import { ListMyRefundsUseCase } from '../application/use-cases/ListMyRefundsUseCase';
import { ListMyPurchasesUseCase } from '../application/use-cases/ListMyPurchasesUseCase';
import { PrismaPurchaseRepository } from '../infrastructure/repositories/PrismaPurchaseRepository';
import { ListPendingRefundsUseCase } from '../application/use-cases/ListPendingRefundsUseCase';
import { RefundProcessor } from '../application/services/RefundProcessor';
import { PrismaRefundRepository } from '../infrastructure/repositories/PrismaRefundRepository';
import { ListEducatorRefundsUseCase } from '../application/use-cases/ListEducatorRefundsUseCase';
import { EducatorApproveRefundUseCase } from '../application/use-cases/EducatorApproveRefundUseCase';
import { EducatorRejectRefundUseCase } from '../application/use-cases/EducatorRejectRefundUseCase';
import { EscalateOverdueRefundsUseCase } from '../application/use-cases/EscalateOverdueRefundsUseCase';
import { EducatorRefundsController } from './controllers/educator.refunds.controller';
import { EXAM_TYPE_REPO, TOPIC_REPO, USER_REPO, OBJECTION_REPO, AUDIT_LOG_REPO, CONTRACT_REPO } from '../application/constants';
import { ContractsModule } from './modules/contracts/contracts.module';
import { GetAdminSettingsUseCase } from '../application/use-cases/GetAdminSettingsUseCase';
import { UpdateAdminSettingsUseCase } from '../application/use-cases/UpdateAdminSettingsUseCase';
import { GetSiteSettingsUseCase } from '../application/use-cases/GetSiteSettingsUseCase';
import { UpdateSiteSettingsUseCase } from '../application/use-cases/UpdateSiteSettingsUseCase';
import { ListFeaturedEducatorsUseCase } from '../application/use-cases/educator/ListFeaturedEducatorsUseCase';
import { ListContractsUseCase } from '../application/use-cases/ListContractsUseCase';
import { CreateContractUseCase } from '../application/use-cases/CreateContractUseCase';
import { UpdateContractUseCase } from '../application/use-cases/UpdateContractUseCase';
import { ListAuditLogsUseCase } from '../application/use-cases/ListAuditLogsUseCase';
import { CreateDiscountCodeUseCase } from '../application/use-cases/CreateDiscountCodeUseCase';
import { ListEducatorDiscountCodesUseCase } from '../application/use-cases/ListEducatorDiscountCodesUseCase';
import { GetEducatorSalesReportUseCase } from '../application/use-cases/GetEducatorSalesReportUseCase';
import { CreateAdPackageUseCase } from '../application/use-cases/CreateAdPackageUseCase';
import { ListAdPackagesUseCase } from '../application/use-cases/ListAdPackagesUseCase';
import { UpdateAdPackageUseCase } from '../application/use-cases/UpdateAdPackageUseCase';
import { DeleteAdPackageUseCase } from '../application/use-cases/DeleteAdPackageUseCase';
import { PurchaseAdUseCase } from '../application/use-cases/PurchaseAdUseCase';
import { ListEducatorAdPurchasesUseCase } from '../application/use-cases/ListEducatorAdPurchasesUseCase';
import { GetEducatorAdStatsUseCase } from '../application/use-cases/GetEducatorAdStatsUseCase';
import { ListEducatorTestsUseCase } from '../application/use-cases/ListEducatorTestsUseCase';
import { ListEducatorPurchasesUseCase } from '../application/use-cases/ListEducatorPurchasesUseCase';
import { ToggleDiscountCodeUseCase } from '../application/use-cases/ToggleDiscountCodeUseCase';
import { AttemptsController } from './controllers/attempts.controller';
import { MetricsController } from './controllers/metrics.controller';
import { AdminCandidatesController } from './controllers/admin.candidates.controller';
import { GetCandidateReportUseCase } from '../application/use-cases/GetCandidateReportUseCase';
import { SendBulkCandidateEmailUseCase } from '../application/use-cases/SendBulkCandidateEmailUseCase';
import { MockEmailProvider } from '../infrastructure/services/MockEmailProvider';
import { AdminEducatorReportController } from './controllers/admin.educator-report.controller';
import { GetEducatorReportUseCase } from '../application/use-cases/GetEducatorReportUseCase';
import { SendBulkEducatorEmailUseCase } from '../application/use-cases/SendBulkEducatorEmailUseCase';
import { AdminCommissionController } from './controllers/admin.commission.controller';
import { GetCommissionReportUseCase } from '../application/use-cases/GetCommissionReportUseCase';
import { GetCommissionRateHistoryUseCase } from '../application/use-cases/GetCommissionRateHistoryUseCase';
import { UpdateCommissionRateUseCase } from '../application/use-cases/UpdateCommissionRateUseCase';
import { GetPopularPackagesUseCase } from '../application/use-cases/GetPopularPackagesUseCase';
import { AdminAdReportController } from './controllers/admin.ad-report.controller';
import { GetAdminAdReportUseCase } from '../application/use-cases/GetAdminAdReportUseCase';
import { MePerformanceController } from './controllers/me.performance.controller';
import { GetTopicPerformanceUseCase } from '../application/use-cases/GetTopicPerformanceUseCase';
// Heartbeat: istemci bağlantı sağlık kontrolü için kullanır
import { MeHeartbeatController } from './controllers/me.heartbeat.controller';
import { AdminWorkersController } from './controllers/admin.workers.controller';
import { CreateWorkerUseCase } from '../application/use-cases/CreateWorkerUseCase';
import { GetWorkerPermissionsUseCase } from '../application/use-cases/GetWorkerPermissionsUseCase';
import { UpdateWorkerPermissionsUseCase } from '../application/use-cases/UpdateWorkerPermissionsUseCase';
import { PackagesController } from './controllers/packages.controller';
import { PrismaTestPackageRepository } from '../infrastructure/repositories/PrismaTestPackageRepository';
import { CreateTestPackageUseCase } from '../application/use-cases/CreateTestPackageUseCase';
import { GetTestPackageUseCase } from '../application/use-cases/GetTestPackageUseCase';
import { ListEducatorPackagesUseCase } from '../application/use-cases/ListEducatorPackagesUseCase';
import { UpdateTestPackageUseCase } from '../application/use-cases/UpdateTestPackageUseCase';
import { AddTestToPackageUseCase } from '../application/use-cases/AddTestToPackageUseCase';
import { RemoveTestFromPackageUseCase } from '../application/use-cases/RemoveTestFromPackageUseCase';
import { PublishTestPackageUseCase } from '../application/use-cases/PublishTestPackageUseCase';
import { UnpublishTestPackageUseCase } from '../application/use-cases/UnpublishTestPackageUseCase';
import { UploadController } from './controllers/upload.controller';
import { AdminStatsController } from './controllers/admin.stats.controller';
import { GetAdminStatsUseCase } from '../application/use-cases/GetAdminStatsUseCase';
import { LiveSessionsController } from './controllers/live-sessions.controller';
import { CreateLiveSessionUseCase } from '../application/use-cases/CreateLiveSessionUseCase';
import { GetLiveSessionStateUseCase } from '../application/use-cases/GetLiveSessionStateUseCase';
import { JoinLiveSessionUseCase } from '../application/use-cases/JoinLiveSessionUseCase';
import { SubmitLiveAnswerUseCase } from '../application/use-cases/SubmitLiveAnswerUseCase';
import { StartLiveSessionUseCase } from '../application/use-cases/StartLiveSessionUseCase';
import { NavigateLiveQuestionUseCase } from '../application/use-cases/NavigateLiveQuestionUseCase';
import { ToggleLiveStatsUseCase } from '../application/use-cases/ToggleLiveStatsUseCase';
import { EndLiveSessionUseCase } from '../application/use-cases/EndLiveSessionUseCase';
import { PingLiveSessionUseCase } from '../application/use-cases/PingLiveSessionUseCase';
import { PayLiveSessionUseCase } from '../application/use-cases/PayLiveSessionUseCase';
import { ListMyLiveSessionsUseCase } from '../application/use-cases/ListMyLiveSessionsUseCase';
import { ListLiveSessionTiersUseCase } from '../application/use-cases/ListLiveSessionTiersUseCase';
import { CreateLiveSessionTierUseCase } from '../application/use-cases/CreateLiveSessionTierUseCase';
import { UpdateLiveSessionTierUseCase } from '../application/use-cases/UpdateLiveSessionTierUseCase';
import { DeleteLiveSessionTierUseCase } from '../application/use-cases/DeleteLiveSessionTierUseCase';
import { GetLiveSessionByCodeUseCase } from '../application/use-cases/GetLiveSessionByCodeUseCase';
import { CreateRound2LiveSessionUseCase } from '../application/use-cases/CreateRound2LiveSessionUseCase';
import { GetLiveSessionComparisonUseCase } from '../application/use-cases/GetLiveSessionComparisonUseCase';

const THROTTLE_TTL_SECONDS = Number(process.env.THROTTLE_TTL_SECONDS ?? '60') || 60;

const throttleDisabled = process.env.THROTTLE_DISABLED === '1';

@Module({
  imports: [
    ...(throttleDisabled
      ? []
      : [
          ThrottlerModule.forRootAsync({
            useFactory: () => {
              // Dev: THROTTLE_DISABLED=1 veya NODE_ENV=development → gevşek limit
              const isDev = process.env.NODE_ENV === 'development';
              const limit = isDev ? 500 : 60;
              const throttlers = [{ ttl: seconds(THROTTLE_TTL_SECONDS), limit }];

              if (process.env.REDIS_DISABLED === '1') {
                return { throttlers };
              }
              const redisUrl = getRedisUrl();
              if (redisUrl) {
                const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 2 });
                // graceful shutdown hooks (best-effort)
                const shutdown = () => {
                  try {
                    redis.disconnect();
                  } catch (e) {
                    /* ignore */
                  }
                };
                process.on('beforeExit', shutdown);
                process.on('SIGINT', () => {
                  shutdown();
                  process.exit(0);
                });
                process.on('SIGTERM', () => {
                  shutdown();
                  process.exit(0);
                });
                return {
                  storage: new ThrottlerStorageRedisService(redis),
                  throttlers,
                };
              }
              return { throttlers };
            },
          }),
        ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    MarketplaceModule,
    ExamTypesModule,
    TestsModule,
    QuestionsModule,
    PurchasesModule,
    AttemptsModule,
    AuditModule,
    ...(process.env.CRON_DISABLED === '1' ? [] : [CronModule]),
    // Refunds
    (require('./modules/refunds/refunds.module').RefundsModule),
    ContractsModule,
  ],
  controllers: [RootController, HealthController, NotificationsController, AdminDlqController, TestsPerformanceController, HomeController, SiteController, ReviewsController, EducatorsController, FollowsController, CspReportController, AdminExamTypesController, AdminTopicsController, AdminEducatorsController, AdminUsersController, ObjectionsController, EducatorObjectionsController, AdminObjectionsController, AdminRefundsController, AdminSettingsController, AdminSiteSettingsController, AdminContractsController, AdminAuditController, AdminAdPackagesController, AdPackagesController, MeRefundsController, MePurchasesController, MePreferencesController, MetricsController, AdminCandidatesController, AdminEducatorReportController, AdminCommissionController, AdminAdReportController, MePerformanceController, MeHeartbeatController, AdminWorkersController, PackagesController, UploadController, AttemptsController, EducatorRefundsController, AdminStatsController, LiveSessionsController],
  providers: [
    SeedService,
    ...(throttleDisabled ? [] : [{ provide: APP_GUARD, useClass: CustomThrottlerGuard }]),
    { provide: EXAM_TYPE_REPO, useClass: PrismaExamTypeRepository },
    { provide: TOPIC_REPO, useClass: PrismaTopicRepository },
    { provide: USER_REPO, useClass: PrismaUserRepository },
    { provide: OBJECTION_REPO, useClass: PrismaObjectionRepository },
    { provide: AUDIT_LOG_REPO, useClass: PrismaAuditLogRepository },
    PrismaAuditLogRepository,
    PrismaAttemptRepository,
    PrismaExamRepository,
    {
      provide: ListExamTypesUseCase,
      useFactory: (repo: PrismaExamTypeRepository) => new ListExamTypesUseCase(repo),
      inject: [EXAM_TYPE_REPO],
    },
    {
      provide: CreateExamTypeUseCase,
      useFactory: (repo: PrismaExamTypeRepository, audit: PrismaAuditLogRepository) => new CreateExamTypeUseCase(repo, audit),
      inject: [EXAM_TYPE_REPO, PrismaAuditLogRepository],
    },
    {
      provide: UpdateExamTypeUseCase,
      useFactory: (repo: PrismaExamTypeRepository, audit: PrismaAuditLogRepository) => new UpdateExamTypeUseCase(repo, audit),
      inject: [EXAM_TYPE_REPO, PrismaAuditLogRepository],
    },
    {
      provide: DeleteExamTypeUseCase,
      useFactory: (repo: PrismaExamTypeRepository, audit: PrismaAuditLogRepository) => new DeleteExamTypeUseCase(repo, audit),
      inject: [EXAM_TYPE_REPO, PrismaAuditLogRepository],
    },
    { provide: ListTopicsByExamTypeUseCase, useFactory: () => new ListTopicsByExamTypeUseCase() },
    { provide: CreateTopicUseCase, useFactory: () => new CreateTopicUseCase() },
    { provide: UpdateTopicUseCase, useFactory: () => new UpdateTopicUseCase() },
    { provide: DeleteTopicUseCase, useFactory: () => new DeleteTopicUseCase() },
    { provide: GetTopicTreeUseCase, useFactory: () => new GetTopicTreeUseCase() },
    {
      provide: ApproveEducatorUseCase,
      useFactory: (userRepo: PrismaUserRepository, auditRepo: PrismaAuditLogRepository) => new ApproveEducatorUseCase(userRepo, auditRepo),
      inject: [USER_REPO, AUDIT_LOG_REPO],
    },
    {
      provide: SuspendEducatorUseCase,
      useFactory: (userRepo: PrismaUserRepository, auditRepo: PrismaAuditLogRepository) => new SuspendEducatorUseCase(userRepo, auditRepo),
      inject: [USER_REPO, AUDIT_LOG_REPO],
    },
    {
      provide: UnsuspendEducatorUseCase,
      useFactory: (userRepo: PrismaUserRepository, auditRepo: PrismaAuditLogRepository) => new UnsuspendEducatorUseCase(userRepo, auditRepo),
      inject: [USER_REPO, AUDIT_LOG_REPO],
    },
    {
      provide: CreateObjectionUseCase,
      useFactory: (
        objectionRepo: PrismaObjectionRepository,
        attemptRepo: PrismaAttemptRepository,
        examRepo: PrismaExamRepository,
        auditRepo: PrismaAuditLogRepository,
      ) => new CreateObjectionUseCase(objectionRepo, attemptRepo, examRepo, auditRepo),
      inject: [OBJECTION_REPO, PrismaAttemptRepository, PrismaExamRepository, PrismaAuditLogRepository],
    },
    {
      provide: AnswerObjectionUseCase,
      useFactory: (
        objectionRepo: PrismaObjectionRepository,
        userRepo: PrismaUserRepository,
        auditRepo: PrismaAuditLogRepository,
      ) => new AnswerObjectionUseCase(objectionRepo, userRepo, auditRepo),
      inject: [OBJECTION_REPO, USER_REPO, PrismaAuditLogRepository],
    },
    {
      provide: ListEscalatedObjectionsUseCase,
      useFactory: (objectionRepo: PrismaObjectionRepository) => new ListEscalatedObjectionsUseCase(objectionRepo),
      inject: [OBJECTION_REPO],
    },
    {
      provide: ListEducatorObjectionsUseCase,
      useFactory: (objectionRepo: PrismaObjectionRepository) => new ListEducatorObjectionsUseCase(objectionRepo),
      inject: [OBJECTION_REPO],
    },
    {
      provide: ListAllObjectionsUseCase,
      useFactory: (objectionRepo: PrismaObjectionRepository) => new ListAllObjectionsUseCase(objectionRepo),
      inject: [OBJECTION_REPO],
    },
    {
      provide: ListTestReportStatsUseCase,
      useFactory: (objectionRepo: PrismaObjectionRepository) => new ListTestReportStatsUseCase(objectionRepo),
      inject: [OBJECTION_REPO],
    },
    PrismaRefundRepository,
    RefundProcessor,
    {
      provide: ApproveRefundUseCase,
      useFactory: (
        refundRepo: PrismaRefundRepository,
        auditRepo: PrismaAuditLogRepository,
        processor: RefundProcessor,
      ) => new ApproveRefundUseCase(refundRepo, auditRepo, processor),
      inject: [PrismaRefundRepository, PrismaAuditLogRepository, RefundProcessor],
    },
    {
      provide: RejectRefundUseCase,
      useFactory: (
        refundRepo: PrismaRefundRepository,
        auditRepo: PrismaAuditLogRepository,
      ) => new RejectRefundUseCase(refundRepo, auditRepo),
      inject: [PrismaRefundRepository, PrismaAuditLogRepository],
    },
    {
      provide: ListMyRefundsUseCase,
      useFactory: (refundRepo: PrismaRefundRepository) => new ListMyRefundsUseCase(refundRepo),
      inject: [PrismaRefundRepository],
    },
    PrismaPurchaseRepository,
    {
      provide: ListMyPurchasesUseCase,
      useFactory: (purchaseRepo: PrismaPurchaseRepository) => new ListMyPurchasesUseCase(purchaseRepo),
      inject: [PrismaPurchaseRepository],
    },
    {
      provide: ListPendingRefundsUseCase,
      useFactory: (refundRepo: PrismaRefundRepository) => new ListPendingRefundsUseCase(refundRepo),
      inject: [PrismaRefundRepository],
    },
    {
      provide: ListEducatorRefundsUseCase,
      useFactory: (refundRepo: PrismaRefundRepository) => new ListEducatorRefundsUseCase(refundRepo),
      inject: [PrismaRefundRepository],
    },
    {
      provide: EducatorApproveRefundUseCase,
      useFactory: (refundRepo: PrismaRefundRepository) => new EducatorApproveRefundUseCase(refundRepo),
      inject: [PrismaRefundRepository],
    },
    {
      provide: EducatorRejectRefundUseCase,
      useFactory: (refundRepo: PrismaRefundRepository) => new EducatorRejectRefundUseCase(refundRepo),
      inject: [PrismaRefundRepository],
    },
    {
      provide: EscalateOverdueRefundsUseCase,
      useFactory: (refundRepo: PrismaRefundRepository) => new EscalateOverdueRefundsUseCase(refundRepo),
      inject: [PrismaRefundRepository],
    },
    { provide: GetAdminSettingsUseCase, useFactory: () => new GetAdminSettingsUseCase() },
    { provide: UpdateAdminSettingsUseCase, useFactory: () => new UpdateAdminSettingsUseCase() },
    GetSiteSettingsUseCase,
    UpdateSiteSettingsUseCase,
    ListFeaturedEducatorsUseCase,
    {
      provide: ListContractsUseCase,
      useFactory: (repo: any) => new ListContractsUseCase(repo),
      inject: [CONTRACT_REPO],
    },
    {
      provide: CreateContractUseCase,
      useFactory: (repo: any) => new CreateContractUseCase(repo),
      inject: [CONTRACT_REPO],
    },
    {
      provide: UpdateContractUseCase,
      useFactory: (repo: any) => new UpdateContractUseCase(repo),
      inject: [CONTRACT_REPO],
    },
    {
      provide: ListAuditLogsUseCase,
      useFactory: (auditRepo: PrismaAuditLogRepository) => new ListAuditLogsUseCase(auditRepo),
      inject: [PrismaAuditLogRepository],
    },
    {
      provide: CreateDiscountCodeUseCase,
      useFactory: (userRepo: PrismaUserRepository, auditRepo: PrismaAuditLogRepository) =>
        new CreateDiscountCodeUseCase(userRepo, auditRepo),
      inject: [USER_REPO, PrismaAuditLogRepository],
    },
    {
      provide: ListEducatorDiscountCodesUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new ListEducatorDiscountCodesUseCase(userRepo),
      inject: [USER_REPO],
    },
    {
      provide: GetEducatorSalesReportUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new GetEducatorSalesReportUseCase(userRepo),
      inject: [USER_REPO],
    },
    CreateAdPackageUseCase,
    ListAdPackagesUseCase,
    UpdateAdPackageUseCase,
    DeleteAdPackageUseCase,
    {
      provide: PurchaseAdUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new PurchaseAdUseCase(userRepo),
      inject: [USER_REPO],
    },
    {
      provide: ListEducatorAdPurchasesUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new ListEducatorAdPurchasesUseCase(userRepo),
      inject: [USER_REPO],
    },
    // GetEducatorAdStatsUseCase bağımlılık gerektirmiyor — doğrudan prisma kullanır
    GetEducatorAdStatsUseCase,
    {
      provide: ListEducatorTestsUseCase,
      useFactory: (examRepo: PrismaExamRepository) => new ListEducatorTestsUseCase(examRepo),
      inject: [PrismaExamRepository],
    },
    {
      provide: ListEducatorPurchasesUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new ListEducatorPurchasesUseCase(userRepo),
      inject: [USER_REPO],
    },
    {
      provide: ToggleDiscountCodeUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new ToggleDiscountCodeUseCase(userRepo),
      inject: [USER_REPO],
    },
    GetCandidateReportUseCase,
    MockEmailProvider,
    {
      provide: SendBulkCandidateEmailUseCase,
      useFactory: (emailProvider: MockEmailProvider) => new SendBulkCandidateEmailUseCase(emailProvider),
      inject: [MockEmailProvider],
    },
    GetEducatorReportUseCase,
    {
      provide: SendBulkEducatorEmailUseCase,
      useFactory: (emailProvider: MockEmailProvider) => new SendBulkEducatorEmailUseCase(emailProvider),
      inject: [MockEmailProvider],
    },
    GetCommissionReportUseCase,
    { provide: GetCommissionRateHistoryUseCase, useFactory: () => new GetCommissionRateHistoryUseCase() },
    { provide: UpdateCommissionRateUseCase, useFactory: () => new UpdateCommissionRateUseCase() },
    GetPopularPackagesUseCase,
    // Reklam satın alım raporu — admin filtreli liste
    GetAdminAdReportUseCase,
    // Konu bazlı aday performans raporu
    GetTopicPerformanceUseCase,
    // Worker rol sistemi
    { provide: CreateWorkerUseCase, useFactory: () => new CreateWorkerUseCase() },
    { provide: GetWorkerPermissionsUseCase, useFactory: () => new GetWorkerPermissionsUseCase() },
    { provide: UpdateWorkerPermissionsUseCase, useFactory: () => new UpdateWorkerPermissionsUseCase() },
    // Admin stats dashboard — bağımlılıksız, doğrudan prisma kullanır
    GetAdminStatsUseCase,
    // LiveSession use-cases — singleton prisma kullanır, bağımlılıksız
    { provide: CreateLiveSessionUseCase, useFactory: () => new CreateLiveSessionUseCase() },
    { provide: GetLiveSessionStateUseCase, useFactory: () => new GetLiveSessionStateUseCase() },
    { provide: JoinLiveSessionUseCase, useFactory: () => new JoinLiveSessionUseCase() },
    { provide: SubmitLiveAnswerUseCase, useFactory: () => new SubmitLiveAnswerUseCase() },
    { provide: StartLiveSessionUseCase, useFactory: () => new StartLiveSessionUseCase() },
    { provide: NavigateLiveQuestionUseCase, useFactory: () => new NavigateLiveQuestionUseCase() },
    { provide: ToggleLiveStatsUseCase, useFactory: () => new ToggleLiveStatsUseCase() },
    { provide: EndLiveSessionUseCase, useFactory: () => new EndLiveSessionUseCase() },
    { provide: PingLiveSessionUseCase, useFactory: () => new PingLiveSessionUseCase() },
    { provide: PayLiveSessionUseCase, useFactory: () => new PayLiveSessionUseCase() },
    { provide: ListMyLiveSessionsUseCase, useFactory: () => new ListMyLiveSessionsUseCase() },
    { provide: ListLiveSessionTiersUseCase, useFactory: () => new ListLiveSessionTiersUseCase() },
    { provide: CreateLiveSessionTierUseCase, useFactory: () => new CreateLiveSessionTierUseCase() },
    { provide: UpdateLiveSessionTierUseCase, useFactory: () => new UpdateLiveSessionTierUseCase() },
    { provide: DeleteLiveSessionTierUseCase, useFactory: () => new DeleteLiveSessionTierUseCase() },
    { provide: GetLiveSessionByCodeUseCase, useFactory: () => new GetLiveSessionByCodeUseCase() },
    { provide: CreateRound2LiveSessionUseCase, useFactory: () => new CreateRound2LiveSessionUseCase() },
    { provide: GetLiveSessionComparisonUseCase, useFactory: () => new GetLiveSessionComparisonUseCase() },
    // TestPackage CRUD
    PrismaTestPackageRepository,
    {
      provide: CreateTestPackageUseCase,
      useFactory: (repo: PrismaTestPackageRepository) => new CreateTestPackageUseCase(repo),
      inject: [PrismaTestPackageRepository],
    },
    {
      provide: GetTestPackageUseCase,
      useFactory: (repo: PrismaTestPackageRepository) => new GetTestPackageUseCase(repo),
      inject: [PrismaTestPackageRepository],
    },
    {
      provide: ListEducatorPackagesUseCase,
      useFactory: (repo: PrismaTestPackageRepository) => new ListEducatorPackagesUseCase(repo),
      inject: [PrismaTestPackageRepository],
    },
    {
      provide: UpdateTestPackageUseCase,
      useFactory: (repo: PrismaTestPackageRepository) => new UpdateTestPackageUseCase(repo),
      inject: [PrismaTestPackageRepository],
    },
    {
      provide: AddTestToPackageUseCase,
      useFactory: (repo: PrismaTestPackageRepository) => new AddTestToPackageUseCase(repo),
      inject: [PrismaTestPackageRepository],
    },
    {
      provide: RemoveTestFromPackageUseCase,
      useFactory: (repo: PrismaTestPackageRepository) => new RemoveTestFromPackageUseCase(repo),
      inject: [PrismaTestPackageRepository],
    },
    {
      provide: PublishTestPackageUseCase,
      useFactory: (repo: PrismaTestPackageRepository) => new PublishTestPackageUseCase(repo),
      inject: [PrismaTestPackageRepository],
    },
    {
      provide: UnpublishTestPackageUseCase,
      useFactory: (repo: PrismaTestPackageRepository) => new UnpublishTestPackageUseCase(repo),
      inject: [PrismaTestPackageRepository],
    },
  ],
})
export class AppModule {}

