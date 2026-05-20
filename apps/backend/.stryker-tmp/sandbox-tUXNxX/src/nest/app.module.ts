// @ts-nocheck
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
import { ListExamTypesUseCase } from '../application/use-cases/admin/ListExamTypesUseCase';
import { CreateExamTypeUseCase } from '../application/use-cases/admin/CreateExamTypeUseCase';
import { UpdateExamTypeUseCase } from '../application/use-cases/admin/UpdateExamTypeUseCase';
import { DeleteExamTypeUseCase } from '../application/use-cases/admin/DeleteExamTypeUseCase';
import { ListTopicsByExamTypeUseCase } from '../application/use-cases/admin/ListTopicsByExamTypeUseCase';
import { CreateTopicUseCase } from '../application/use-cases/admin/CreateTopicUseCase';
import { UpdateTopicUseCase } from '../application/use-cases/admin/UpdateTopicUseCase';
import { DeleteTopicUseCase } from '../application/use-cases/admin/DeleteTopicUseCase';
import { GetTopicTreeUseCase } from '../application/use-cases/admin/GetTopicTreeUseCase';
import { ApproveEducatorUseCase } from '../application/use-cases/educator/ApproveEducatorUseCase';
import { SuspendEducatorUseCase } from '../application/use-cases/educator/SuspendEducatorUseCase';
import { UnsuspendEducatorUseCase } from '../application/use-cases/educator/UnsuspendEducatorUseCase';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { PrismaObjectionRepository } from '../infrastructure/repositories/PrismaObjectionRepository';
import { PrismaAttemptRepository } from '../infrastructure/repositories/PrismaAttemptRepository';
import { PrismaExamRepository } from '../infrastructure/repositories/PrismaExamRepository';
import { getRedisUrl } from '../config/redis';
import { CreateObjectionUseCase } from '../application/use-cases/objection/CreateObjectionUseCase';
import { AnswerObjectionUseCase } from '../application/use-cases/objection/AnswerObjectionUseCase';
import { ListEscalatedObjectionsUseCase } from '../application/use-cases/objection/ListEscalatedObjectionsUseCase';
import { ListEducatorObjectionsUseCase } from '../application/use-cases/objection/ListEducatorObjectionsUseCase';
import { ListAllObjectionsUseCase } from '../application/use-cases/objection/ListAllObjectionsUseCase';
import { ListTestReportStatsUseCase } from '../application/use-cases/report/ListTestReportStatsUseCase';
import { ApproveRefundUseCase } from '../application/use-cases/refund/ApproveRefundUseCase';
import { RejectRefundUseCase } from '../application/use-cases/refund/RejectRefundUseCase';
import { ListMyRefundsUseCase } from '../application/use-cases/refund/ListMyRefundsUseCase';
import { ListMyPurchasesUseCase } from '../application/use-cases/purchase/ListMyPurchasesUseCase';
import { PrismaPurchaseRepository } from '../infrastructure/repositories/PrismaPurchaseRepository';
import { ListPendingRefundsUseCase } from '../application/use-cases/refund/ListPendingRefundsUseCase';
import { RefundProcessor } from '../application/services/RefundProcessor';
import { PrismaRefundRepository } from '../infrastructure/repositories/PrismaRefundRepository';
import { ListEducatorRefundsUseCase } from '../application/use-cases/refund/ListEducatorRefundsUseCase';
import { EducatorApproveRefundUseCase } from '../application/use-cases/refund/EducatorApproveRefundUseCase';
import { EducatorRejectRefundUseCase } from '../application/use-cases/refund/EducatorRejectRefundUseCase';
import { EscalateOverdueRefundsUseCase } from '../application/use-cases/refund/EscalateOverdueRefundsUseCase';
import { EducatorRefundsController } from './controllers/educator.refunds.controller';
import { EXAM_TYPE_REPO, TOPIC_REPO, USER_REPO, OBJECTION_REPO, AUDIT_LOG_REPO, CONTRACT_REPO } from '../application/constants';
import { ContractsModule } from './modules/contracts/contracts.module';
import { GetAdminSettingsUseCase } from '../application/use-cases/admin/GetAdminSettingsUseCase';
import { UpdateAdminSettingsUseCase } from '../application/use-cases/admin/UpdateAdminSettingsUseCase';
import { GetSiteSettingsUseCase } from '../application/use-cases/admin/GetSiteSettingsUseCase';
import { UpdateSiteSettingsUseCase } from '../application/use-cases/admin/UpdateSiteSettingsUseCase';
import { ListFeaturedEducatorsUseCase } from '../application/use-cases/educator/ListFeaturedEducatorsUseCase';
import { ListContractsUseCase } from '../application/use-cases/contract/ListContractsUseCase';
import { CreateContractUseCase } from '../application/use-cases/contract/CreateContractUseCase';
import { UpdateContractUseCase } from '../application/use-cases/contract/UpdateContractUseCase';
import { ListAuditLogsUseCase } from '../application/use-cases/admin/ListAuditLogsUseCase';
import { CreateDiscountCodeUseCase } from '../application/use-cases/discount/CreateDiscountCodeUseCase';
import { ListEducatorDiscountCodesUseCase } from '../application/use-cases/discount/ListEducatorDiscountCodesUseCase';
import { GetEducatorSalesReportUseCase } from '../application/use-cases/report/GetEducatorSalesReportUseCase';
import { CreateAdPackageUseCase } from '../application/use-cases/ad/CreateAdPackageUseCase';
import { ListAdPackagesUseCase } from '../application/use-cases/ad/ListAdPackagesUseCase';
import { UpdateAdPackageUseCase } from '../application/use-cases/ad/UpdateAdPackageUseCase';
import { DeleteAdPackageUseCase } from '../application/use-cases/ad/DeleteAdPackageUseCase';
import { PurchaseAdUseCase } from '../application/use-cases/ad/PurchaseAdUseCase';
import { ListEducatorAdPurchasesUseCase } from '../application/use-cases/ad/ListEducatorAdPurchasesUseCase';
import { GetEducatorAdStatsUseCase } from '../application/use-cases/ad/GetEducatorAdStatsUseCase';
import { ListEducatorTestsUseCase } from '../application/use-cases/test/ListEducatorTestsUseCase';
import { ListEducatorPurchasesUseCase } from '../application/use-cases/purchase/ListEducatorPurchasesUseCase';
import { ToggleDiscountCodeUseCase } from '../application/use-cases/discount/ToggleDiscountCodeUseCase';
import { AttemptsController } from './controllers/attempts.controller';
import { MetricsController } from './controllers/metrics.controller';
import { AdminCandidatesController } from './controllers/admin.candidates.controller';
import { GetCandidateReportUseCase } from '../application/use-cases/report/GetCandidateReportUseCase';
import { SendBulkCandidateEmailUseCase } from '../application/use-cases/admin/SendBulkCandidateEmailUseCase';
import { MockEmailProvider } from '../infrastructure/services/MockEmailProvider';
import { AdminEducatorReportController } from './controllers/admin.educator-report.controller';
import { GetEducatorReportUseCase } from '../application/use-cases/report/GetEducatorReportUseCase';
import { SendBulkEducatorEmailUseCase } from '../application/use-cases/admin/SendBulkEducatorEmailUseCase';
import { AdminCommissionController } from './controllers/admin.commission.controller';
import { GetCommissionReportUseCase } from '../application/use-cases/report/GetCommissionReportUseCase';
import { GetCommissionRateHistoryUseCase } from '../application/use-cases/report/GetCommissionRateHistoryUseCase';
import { UpdateCommissionRateUseCase } from '../application/use-cases/admin/UpdateCommissionRateUseCase';
import { GetPopularPackagesUseCase } from '../application/use-cases/package/GetPopularPackagesUseCase';
import { AdminAdReportController } from './controllers/admin.ad-report.controller';
import { GetAdminAdReportUseCase } from '../application/use-cases/admin/GetAdminAdReportUseCase';
import { MePerformanceController } from './controllers/me.performance.controller';
import { GetTopicPerformanceUseCase } from '../application/use-cases/report/GetTopicPerformanceUseCase';
// Heartbeat: istemci bağlantı sağlık kontrolü için kullanır
import { MeHeartbeatController } from './controllers/me.heartbeat.controller';
import { AdminWorkersController } from './controllers/admin.workers.controller';
import { CreateWorkerUseCase } from '../application/use-cases/admin/CreateWorkerUseCase';
import { GetWorkerPermissionsUseCase } from '../application/use-cases/admin/GetWorkerPermissionsUseCase';
import { UpdateWorkerPermissionsUseCase } from '../application/use-cases/admin/UpdateWorkerPermissionsUseCase';
import { PackagesController } from './controllers/packages.controller';
import { PrismaTestPackageRepository } from '../infrastructure/repositories/PrismaTestPackageRepository';
import { CreateTestPackageUseCase } from '../application/use-cases/package/CreateTestPackageUseCase';
import { GetTestPackageUseCase } from '../application/use-cases/package/GetTestPackageUseCase';
import { ListEducatorPackagesUseCase } from '../application/use-cases/package/ListEducatorPackagesUseCase';
import { UpdateTestPackageUseCase } from '../application/use-cases/package/UpdateTestPackageUseCase';
import { AddTestToPackageUseCase } from '../application/use-cases/package/AddTestToPackageUseCase';
import { RemoveTestFromPackageUseCase } from '../application/use-cases/package/RemoveTestFromPackageUseCase';
import { PublishTestPackageUseCase } from '../application/use-cases/package/PublishTestPackageUseCase';
import { UnpublishTestPackageUseCase } from '../application/use-cases/package/UnpublishTestPackageUseCase';
import { UploadController } from './controllers/upload.controller';
import { AdminStatsController } from './controllers/admin.stats.controller';
import { GetAdminStatsUseCase } from '../application/use-cases/admin/GetAdminStatsUseCase';
import { LiveSessionsController } from './controllers/live-sessions.controller';
import { CreateLiveSessionUseCase } from '../application/use-cases/live/CreateLiveSessionUseCase';
import { GetLiveSessionStateUseCase } from '../application/use-cases/live/GetLiveSessionStateUseCase';
import { JoinLiveSessionUseCase } from '../application/use-cases/live/JoinLiveSessionUseCase';
import { SubmitLiveAnswerUseCase } from '../application/use-cases/live/SubmitLiveAnswerUseCase';
import { StartLiveSessionUseCase } from '../application/use-cases/live/StartLiveSessionUseCase';
import { NavigateLiveQuestionUseCase } from '../application/use-cases/live/NavigateLiveQuestionUseCase';
import { ToggleLiveStatsUseCase } from '../application/use-cases/live/ToggleLiveStatsUseCase';
import { EndLiveSessionUseCase } from '../application/use-cases/live/EndLiveSessionUseCase';
import { PingLiveSessionUseCase } from '../application/use-cases/live/PingLiveSessionUseCase';
import { PayLiveSessionUseCase } from '../application/use-cases/live/PayLiveSessionUseCase';
import { ListMyLiveSessionsUseCase } from '../application/use-cases/live/ListMyLiveSessionsUseCase';
import { ListLiveSessionTiersUseCase } from '../application/use-cases/live/ListLiveSessionTiersUseCase';
import { CreateLiveSessionTierUseCase } from '../application/use-cases/live/CreateLiveSessionTierUseCase';
import { UpdateLiveSessionTierUseCase } from '../application/use-cases/live/UpdateLiveSessionTierUseCase';
import { DeleteLiveSessionTierUseCase } from '../application/use-cases/live/DeleteLiveSessionTierUseCase';
import { GetLiveSessionByCodeUseCase } from '../application/use-cases/live/GetLiveSessionByCodeUseCase';
import { CreateRound2LiveSessionUseCase } from '../application/use-cases/live/CreateRound2LiveSessionUseCase';
import { GetLiveSessionComparisonUseCase } from '../application/use-cases/live/GetLiveSessionComparisonUseCase';

// ── Wire-up: Subscription / Billing / 2FA / Audit / Idempotency ──────────────
// Aşağıdaki provider'lar 6 aşamalı kalite-aksiyonu çalışmasının son aşaması
// (Aşama 6 — wire-up) olarak eklendi. Tüm dosyalar mevcut Use Case + Repository
// + Controller yapısını izliyor; AppModule'a takılınca kullanılabilir hale geliyor.
import { WebhookController } from './controllers/webhook.controller';
import { BillingController } from './controllers/v1/billing.controller';
import { TwoFactorController } from './controllers/v1/two-factor.controller';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { TierGuard } from './guards/tier.guard';
import { RedisCache } from '../infrastructure/cache/RedisCache';
import { AuditLogger } from '../infrastructure/audit/AuditLogger';
import { StripeBillingService } from '../infrastructure/services/StripeBillingService';
import { TwoFactorService } from '../infrastructure/security/TwoFactorService';
import { PasswordService } from '../infrastructure/services/PasswordService';
import { JwtService as AppJwtService } from '../infrastructure/services/JwtService';
import { PrismaSubscriptionRepository } from '../infrastructure/repositories/PrismaSubscriptionRepository';
import { SUBSCRIPTION_REPOSITORY } from '../domain/interfaces/SubscriptionRepository';
import { StartCheckoutUseCase } from '../application/use-cases/billing/StartCheckoutUseCase';
import { CreatePortalLinkUseCase } from '../application/use-cases/billing/CreatePortalLinkUseCase';
import { GetMySubscriptionUseCase } from '../application/use-cases/billing/GetMySubscriptionUseCase';
import { HandleStripeWebhookUseCase } from '../application/use-cases/billing/HandleStripeWebhookUseCase';
import { HandleIyzicoWebhookUseCase } from '../application/use-cases/billing/HandleIyzicoWebhookUseCase';
import { SetupTwoFactorUseCase } from '../application/use-cases/auth/SetupTwoFactorUseCase';
import { VerifyTwoFactorLoginUseCase } from '../application/use-cases/auth/VerifyTwoFactorLoginUseCase';
import { DisableTwoFactorUseCase } from '../application/use-cases/auth/DisableTwoFactorUseCase';

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
  controllers: [RootController, HealthController, NotificationsController, AdminDlqController, TestsPerformanceController, HomeController, SiteController, ReviewsController, EducatorsController, FollowsController, CspReportController, AdminExamTypesController, AdminTopicsController, AdminEducatorsController, AdminUsersController, ObjectionsController, EducatorObjectionsController, AdminObjectionsController, AdminRefundsController, AdminSettingsController, AdminSiteSettingsController, AdminContractsController, AdminAuditController, AdminAdPackagesController, AdPackagesController, MeRefundsController, MePurchasesController, MePreferencesController, MetricsController, AdminCandidatesController, AdminEducatorReportController, AdminCommissionController, AdminAdReportController, MePerformanceController, MeHeartbeatController, AdminWorkersController, PackagesController, UploadController, AttemptsController, EducatorRefundsController, AdminStatsController, LiveSessionsController,
    // Aşama 6 — wire-up: yeni controller'lar
    WebhookController,
    BillingController,
    TwoFactorController,
  ],
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
    // ── Aşama 6 — wire-up provider'ları ──────────────────────────────────────
    // Idempotency interceptor: para akışı endpoint'lerinde @UseInterceptors ile kullanılır.
    // RedisCache singleton: yeni instance her seferinde değil, DI ile tek instance.
    RedisCache,
    IdempotencyInterceptor,
    // Audit logger: AdminUseCase'leri ve auth akışı kullanır.
    AuditLogger,
    // Stripe Billing — STRIPE_SECRET_KEY yoksa devre dışı (isEnabled() = false).
    StripeBillingService,
    // 2FA service + password/JWT (auth-module'da zaten var ama burada da expose).
    TwoFactorService,
    PasswordService,
    AppJwtService,
    // Subscription repository — TierGuard ve billing use case'leri için.
    PrismaSubscriptionRepository,
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: PrismaSubscriptionRepository,
    },
    // Tier guard — sadece @RequireTier dekoratörü ile kullanılan endpoint'leri etkiler.
    // Global guard değil (APP_GUARD ile bind edilmedi) — selective use only.
    TierGuard,
    // Billing use case'leri
    StartCheckoutUseCase,
    CreatePortalLinkUseCase,
    GetMySubscriptionUseCase,
    HandleStripeWebhookUseCase,
    HandleIyzicoWebhookUseCase,
    // 2FA use case'leri
    SetupTwoFactorUseCase,
    VerifyTwoFactorLoginUseCase,
    DisableTwoFactorUseCase,
  ],
})
export class AppModule {}

