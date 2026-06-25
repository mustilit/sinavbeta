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
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsController } from './controllers/notifications.controller';
import { AdminDlqController } from './controllers/admin.dlq.controller';
import { TestsPerformanceController } from './controllers/tests.performance.controller';
import { HomeController } from './controllers/home.controller';
import { AdminSchoolsController } from './controllers/admin.schools.controller';
import { SchoolController } from './controllers/school.controller';
import { SchoolExamsController } from './controllers/school-exams.controller';
import { SchoolAssignmentsController } from './controllers/school-assignments.controller';
import { SchoolStudentController } from './controllers/school-student.controller';
import { SchoolGradingController } from './controllers/school-grading.controller';
import { ReviewsController } from './controllers/reviews.controller';
import { EducatorsController } from './controllers/educators.controller';
import { FollowsController } from './controllers/follows.controller';
import { CspReportController } from './controllers/csp-report.controller';
import { AdminExamTypesController } from './controllers/admin.exam-types.controller';
import { AdminGradeLevelsController } from './controllers/admin.grade-levels.controller';
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
import { MeObjectionsController } from './controllers/me.objections.controller';
import { MePurchasesController } from './controllers/me.purchases.controller';
import { MeDevicesController } from './controllers/me.devices.controller';
import { MePreferencesController } from './controllers/me.preferences.controller';
import { AdminUsersController } from './controllers/admin.users.controller';
import { SeedService } from './bootstrap/seed.service';
import { SecretsMigrationService } from './bootstrap/secrets-migration.service';
import { PrismaExamTypeRepository } from '../infrastructure/repositories/PrismaExamTypeRepository';
import { PrismaAuditLogRepository } from '../infrastructure/repositories/PrismaAuditLogRepository';
import { PrismaTopicRepository } from '../infrastructure/repositories/PrismaTopicRepository';
import { ListExamTypesUseCase } from '../application/use-cases/admin/ListExamTypesUseCase';
import { CreateExamTypeUseCase } from '../application/use-cases/admin/CreateExamTypeUseCase';
import { ListGradeLevelsUseCase, CreateGradeLevelUseCase, UpdateGradeLevelUseCase, DeleteGradeLevelUseCase } from '../application/use-cases/admin/GradeLevelUseCases';
import { UpdateExamTypeUseCase } from '../application/use-cases/admin/UpdateExamTypeUseCase';
import { DeleteExamTypeUseCase } from '../application/use-cases/admin/DeleteExamTypeUseCase';
import { ListTopicsByExamTypeUseCase } from '../application/use-cases/admin/ListTopicsByExamTypeUseCase';
import { CreateTopicUseCase } from '../application/use-cases/admin/CreateTopicUseCase';
import { UpdateTopicUseCase } from '../application/use-cases/admin/UpdateTopicUseCase';
import { DeleteTopicUseCase } from '../application/use-cases/admin/DeleteTopicUseCase';
import { GetTopicTreeUseCase } from '../application/use-cases/admin/GetTopicTreeUseCase';
import { ApproveEducatorUseCase } from '../application/use-cases/educator/ApproveEducatorUseCase';
import { RejectEducatorUseCase } from '../application/use-cases/educator/RejectEducatorUseCase';
import { SuspendEducatorUseCase } from '../application/use-cases/educator/SuspendEducatorUseCase';
import { UnsuspendEducatorUseCase } from '../application/use-cases/educator/UnsuspendEducatorUseCase';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { PrismaObjectionRepository } from '../infrastructure/repositories/PrismaObjectionRepository';
import { PrismaAttemptRepository } from '../infrastructure/repositories/PrismaAttemptRepository';
import { PrismaExamRepository } from '../infrastructure/repositories/PrismaExamRepository';
import { getRedisUrl } from '../config/redis';
import { CreateObjectionUseCase } from '../application/use-cases/objection/CreateObjectionUseCase';
import { AnswerObjectionUseCase } from '../application/use-cases/objection/AnswerObjectionUseCase';
import { AnswerObjectionByAdminUseCase } from '../application/use-cases/objection/AnswerObjectionByAdminUseCase';
import { ListEscalatedObjectionsUseCase } from '../application/use-cases/objection/ListEscalatedObjectionsUseCase';
import { ListEducatorObjectionsUseCase } from '../application/use-cases/objection/ListEducatorObjectionsUseCase';
import { ListEducatorContentReportsUseCase } from '../application/use-cases/objection/ListEducatorContentReportsUseCase';
import { AnswerContentReportUseCase, NoteContentReportUseCase, ListAllContentReportsUseCase } from '../application/use-cases/objection/ContentReportUseCases';
import { ListAllObjectionsUseCase } from '../application/use-cases/objection/ListAllObjectionsUseCase';
import { ListTestReportStatsUseCase } from '../application/use-cases/report/ListTestReportStatsUseCase';
import { ApproveRefundUseCase } from '../application/use-cases/refund/ApproveRefundUseCase';
import { RejectRefundUseCase } from '../application/use-cases/refund/RejectRefundUseCase';
import { ListMyRefundsUseCase } from '../application/use-cases/refund/ListMyRefundsUseCase';
import { ListMyObjectionsUseCase } from '../application/use-cases/objection/ListMyObjectionsUseCase';
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
import { ValidateDiscountCodeUseCase } from '../application/use-cases/discount/ValidateDiscountCodeUseCase';
import { DiscountValidateController } from './controllers/discount-validate.controller';
// Sprint 15 #3 — Platform admin promo kodu (LIVE_SESSION + AD_PACKAGE)
import { CreatePlatformPromoCodeUseCase } from '../application/use-cases/platform-promo/CreatePlatformPromoCodeUseCase';
import { ListPlatformPromoCodesUseCase } from '../application/use-cases/platform-promo/ListPlatformPromoCodesUseCase';
import { DeletePlatformPromoCodeUseCase } from '../application/use-cases/platform-promo/DeletePlatformPromoCodeUseCase';
import { TogglePlatformPromoCodeUseCase } from '../application/use-cases/platform-promo/TogglePlatformPromoCodeUseCase';
import { ValidatePlatformPromoCodeUseCase } from '../application/use-cases/platform-promo/ValidatePlatformPromoCodeUseCase';
import { AdminPlatformPromoController } from './controllers/admin.platform-promo.controller';
import { PlatformPromoValidateController } from './controllers/platform-promo-validate.controller';
import { ListAllDiscountCodesUseCase } from '../application/use-cases/discount/ListAllDiscountCodesUseCase';
import { DeleteDiscountCodeUseCase } from '../application/use-cases/discount/DeleteDiscountCodeUseCase';
import { AdminDiscountCodesController } from './controllers/admin.discount-codes.controller';
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
import { GetBackupSettingsUseCase } from '../application/use-cases/admin/GetBackupSettingsUseCase';
import { UpdateBackupSettingsUseCase } from '../application/use-cases/admin/UpdateBackupSettingsUseCase';
import { RunBackupNowUseCase } from '../application/use-cases/admin/RunBackupNowUseCase';
import { ListBackupLogsUseCase } from '../application/use-cases/admin/ListBackupLogsUseCase';
import { BackupSchedulerService } from './services/BackupSchedulerService';
import { AdminBackupController } from './controllers/admin.backup.controller';
import { PackagesController } from './controllers/packages.controller';
import { DraftsController } from './controllers/drafts.controller';
import { CandidateNotesController } from './controllers/candidate-notes.controller';
import { CreateCandidateNoteUseCase } from '../application/use-cases/note/CreateCandidateNoteUseCase';
import { ListCandidateNotesUseCase } from '../application/use-cases/note/ListCandidateNotesUseCase';
import { GetCandidateNoteFacetsUseCase } from '../application/use-cases/note/GetCandidateNoteFacetsUseCase';
import { UpdateCandidateNoteUseCase } from '../application/use-cases/note/UpdateCandidateNoteUseCase';
import { DeleteCandidateNoteUseCase } from '../application/use-cases/note/DeleteCandidateNoteUseCase';
// Yazılı Test modülü
import { WrittenTestsController, WrittenTestsItemController } from './controllers/written-tests.controller';
import {
  CreateWrittenPackageUseCase,
  UpdateWrittenPackageUseCase,
  PublishWrittenPackageUseCase,
  UnpublishWrittenPackageUseCase,
  ListEducatorWrittenPackagesUseCase,
  GetWrittenPackageUseCase,
} from '../application/use-cases/written/WrittenPackageUseCases';
import {
  CreateWrittenTestUseCase,
  UpdateWrittenTestUseCase,
  DeleteWrittenTestUseCase,
} from '../application/use-cases/written/WrittenTestUseCases';
import {
  CreateWrittenQuestionUseCase,
  UpdateWrittenQuestionUseCase,
  DeleteWrittenQuestionUseCase,
} from '../application/use-cases/written/WrittenQuestionUseCases';
import { PurchaseWrittenPackageUseCase, ValidateWrittenDiscountUseCase } from '../application/use-cases/written/WrittenPurchaseUseCases';
import {
  StartWrittenAttemptUseCase,
  SubmitWrittenAnswerUseCase,
  GetWrittenAttemptStateUseCase,
  SubmitWrittenAttemptUseCase,
  TimeoutWrittenAttemptUseCase,
  GetWrittenQuestionSolutionUseCase,
} from '../application/use-cases/written/WrittenAttemptUseCases';
import { ReportWrittenQuestionUseCase } from '../application/use-cases/written/ReportWrittenQuestionUseCase';
import { ListMyWrittenQuestionReportsUseCase } from '../application/use-cases/written/ListMyWrittenQuestionReportsUseCase';
import {
  ListPublishedWrittenPackagesUseCase,
  GetPublishedWrittenPackageUseCase,
  ListMyWrittenPurchasesUseCase,
} from '../application/use-cases/written/CandidateWrittenUseCases';
import {
  UpsertWrittenReviewUseCase,
  ListWrittenReviewsUseCase,
  GetMyWrittenReviewUseCase,
} from '../application/use-cases/written/WrittenReviewUseCases';
import { CandidateWrittenController } from './controllers/candidate-written.controller';
// Tünel modülü (Faz 1)
import { TunnelsController } from './controllers/tunnels.controller';
import { AdminTunnelsController } from './controllers/admin.tunnels.controller';
import { CreateTunnelUseCase } from '../application/use-cases/tunnel/CreateTunnelUseCase';
import { UpdateTunnelUseCase } from '../application/use-cases/tunnel/UpdateTunnelUseCase';
import { SaveTunnelQuestionsUseCase } from '../application/use-cases/tunnel/SaveTunnelQuestionsUseCase';
import { SubmitTunnelForApprovalUseCase } from '../application/use-cases/tunnel/SubmitTunnelForApprovalUseCase';
import { GetTunnelUseCase } from '../application/use-cases/tunnel/GetTunnelUseCase';
import { ListEducatorTunnelsUseCase, ListPendingTunnelsUseCase } from '../application/use-cases/tunnel/ListTunnelsUseCase';
import { ApproveTunnelUseCase, RejectTunnelUseCase } from '../application/use-cases/tunnel/ReviewTunnelUseCase';
// Tünel Faz 2 — aday akışı
import { CandidateTunnelsController } from './controllers/candidate-tunnels.controller';
import { ListPublishedTunnelsUseCase, GetPublishedTunnelMetaUseCase } from '../application/use-cases/tunnel/CandidateTunnelUseCases';
import { PurchaseTunnelUseCase } from '../application/use-cases/tunnel/PurchaseTunnelUseCase';
import { ValidateTunnelDiscountUseCase } from '../application/use-cases/tunnel/ValidateTunnelDiscountUseCase';
import { StartTunnelAttemptUseCase, GetTunnelAttemptStateUseCase } from '../application/use-cases/tunnel/StartTunnelAttemptUseCase';
import { SubmitTunnelAnswerUseCase } from '../application/use-cases/tunnel/SubmitTunnelAnswerUseCase';
import { ReportTunnelQuestionUseCase } from '../application/use-cases/tunnel/ReportTunnelQuestionUseCase';
import { GetCandidateTunnelReportsUseCase } from '../application/use-cases/tunnel/GetCandidateTunnelReportsUseCase';
import { ListMyTunnelQuestionReportsUseCase } from '../application/use-cases/tunnel/ListMyTunnelQuestionReportsUseCase';
import { UpsertTunnelReviewUseCase, ListTunnelReviewsUseCase, GetMyTunnelReviewUseCase } from '../application/use-cases/tunnel/TunnelReviewUseCases';
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
import { getSharedModerateTextContentUseCase } from '../application/services/content-safety/sharedModeration';
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
import { GoogleAuthUseCase } from '../application/use-cases/auth/GoogleAuthUseCase';
import { DisableTwoFactorUseCase } from '../application/use-cases/auth/DisableTwoFactorUseCase';
// ── İçerik Moderasyonu ───────────────────────────────────────────────────
import { ContentSafetyModule } from './modules/content-safety/content-safety.module';
import { AdminModerationController } from './controllers/admin.moderation.controller';
import { MeModerationController } from './controllers/me.moderation.controller';
// ── Email Trafiği Modülü ────────────────────────────────────────────────
import { AdminEmailController } from './controllers/admin.email.controller';
import { MeEmailPreferencesController } from './controllers/me.email-preferences.controller';
import { MeAccountController } from './controllers/me.account.controller';
import { DeleteMyAccountUseCase } from '../application/use-cases/auth/DeleteMyAccountUseCase';
import { GracefulShutdownService } from './services/graceful-shutdown.service';
import { EmailWebhookController } from './controllers/email-webhook.controller';
import { EmailSeedService } from './bootstrap/email-seed.service';
import { SendEmailUseCase } from '../application/use-cases/email/SendEmailUseCase';
import { HandleEmailWebhookUseCase } from '../application/use-cases/email/HandleEmailWebhookUseCase';
import { ListEmailLogsUseCase } from '../application/use-cases/email/ListEmailLogsUseCase';
import { GetEmailLogDetailUseCase } from '../application/use-cases/email/GetEmailLogDetailUseCase';
import { RetryFailedEmailUseCase } from '../application/use-cases/email/RetryFailedEmailUseCase';
import { ManageProviderConfigUseCase } from '../application/use-cases/email/ManageProviderConfigUseCase';
import { TestProviderConfigUseCase } from '../application/use-cases/email/TestProviderConfigUseCase';
import { ToggleEmailKillSwitchUseCase } from '../application/use-cases/email/ToggleEmailKillSwitchUseCase';
import { ManageSuppressedEmailUseCase } from '../application/use-cases/email/ManageSuppressedEmailUseCase';
import { ManageEmailTemplateUseCase } from '../application/use-cases/email/ManageEmailTemplateUseCase';
import { UpdateUserEmailPreferencesUseCase } from '../application/use-cases/email/UpdateUserEmailPreferencesUseCase';
import { UnsubscribeViaTokenUseCase } from '../application/use-cases/email/UnsubscribeViaTokenUseCase';
import { GetEmailTrafficMetricsUseCase } from '../application/use-cases/email/GetEmailTrafficMetricsUseCase';
import { AnonymizeOldEmailLogsUseCase } from '../application/use-cases/email/AnonymizeOldEmailLogsUseCase';
import { CheckBounceRateAlertUseCase } from '../application/use-cases/email/CheckBounceRateAlertUseCase';
import { ResetProviderDailyCountUseCase } from '../application/use-cases/email/ResetProviderDailyCountUseCase';
import { ExpireSuppressionsUseCase } from '../application/use-cases/email/ExpireSuppressionsUseCase';

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
              // Kullanıcı/IP başına limit (key için bkz. CustomThrottlerGuard).
              // SPA bir sayfada onlarca API çağrısı yaptığından kullanıcı başına
              // 120/dk makul bir burst toleransı sağlar.
              const limit = isDev ? 500 : Number(process.env.THROTTLE_LIMIT ?? '120') || 120;
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
    // BackupSchedulerService SchedulerRegistry'ye ihtiyaç duyduğu için
    // ScheduleModule cron-disabled ortamda da yüklenir; saatlik @Cron handler'ları
    // içeren CronModule sadece etkin ortamlarda eklenir.
    ScheduleModule.forRoot(),
    ...(process.env.CRON_DISABLED === '1' ? [] : [CronModule]),
    // Refunds
    (require('./modules/refunds/refunds.module').RefundsModule),
    ContractsModule,
    ContentSafetyModule,
  ],
  controllers: [RootController, HealthController, NotificationsController, AdminDlqController, TestsPerformanceController, HomeController, SiteController, ReviewsController, EducatorsController, FollowsController, CspReportController, AdminExamTypesController, AdminGradeLevelsController, AdminTopicsController, AdminEducatorsController, AdminUsersController, ObjectionsController, EducatorObjectionsController, AdminObjectionsController, AdminRefundsController, AdminSettingsController, AdminSiteSettingsController, AdminContractsController, AdminAuditController, AdminAdPackagesController, AdPackagesController, MeRefundsController, MeObjectionsController, MePurchasesController, MeDevicesController, AdminDiscountCodesController, MePreferencesController, MetricsController, AdminCandidatesController, AdminEducatorReportController, AdminCommissionController, AdminAdReportController, MePerformanceController, MeHeartbeatController, AdminWorkersController, PackagesController, UploadController, AttemptsController, EducatorRefundsController, AdminStatsController, LiveSessionsController,
    // Aşama 6 — wire-up: yeni controller'lar
    WebhookController,
    BillingController,
    TwoFactorController,
    // Sprint 15 — Aday indirim kodu validate endpoint'i
    DiscountValidateController,
    // Sprint 15 #3 — Platform promo kodu (admin CRUD + educator validate)
    AdminPlatformPromoController,
    PlatformPromoValidateController,
    // İçerik Moderasyonu
    AdminModerationController,
    AdminBackupController,
    MeModerationController,
    // Email Trafiği Modülü
    AdminEmailController,
    MeEmailPreferencesController,
    MeAccountController,
    EmailWebhookController,
    // Server-side draft yedek endpoint'leri (autoSave)
    DraftsController,
    // Aday kişisel notları
    CandidateNotesController,
    // Tünel modülü
    TunnelsController,
    AdminTunnelsController,
    CandidateTunnelsController,
    // Yazılı Test modülü
    WrittenTestsController,
    WrittenTestsItemController,
    CandidateWrittenController,
    // E-Sınıf (Okul) modülü — Sprint 1 Foundation
    AdminSchoolsController,
    SchoolController,
    // E-Sınıf — Sprint 2 sınav içeriği + havuz
    SchoolExamsController,
    // E-Sınıf — Sprint 3 ödev + öğrenci çözme
    SchoolAssignmentsController,
    SchoolStudentController,
    // E-Sınıf — Sprint 4 yazılı değerlendirme
    SchoolGradingController,
  ],
  providers: [
    SeedService,
    EmailSeedService,
    SecretsMigrationService,
    // Email Trafiği use case'leri — useFactory ile (singleton prisma kullanır;
    // PrismaClient inject edilemediği için class shortcut çalışmıyor).
    { provide: SendEmailUseCase, useFactory: () => new SendEmailUseCase() },
    { provide: HandleEmailWebhookUseCase, useFactory: () => new HandleEmailWebhookUseCase() },
    { provide: ListEmailLogsUseCase, useFactory: () => new ListEmailLogsUseCase() },
    { provide: GetEmailLogDetailUseCase, useFactory: () => new GetEmailLogDetailUseCase() },
    { provide: RetryFailedEmailUseCase, useFactory: () => new RetryFailedEmailUseCase() },
    { provide: ManageProviderConfigUseCase, useFactory: () => new ManageProviderConfigUseCase() },
    { provide: TestProviderConfigUseCase, useFactory: () => new TestProviderConfigUseCase() },
    { provide: ToggleEmailKillSwitchUseCase, useFactory: () => new ToggleEmailKillSwitchUseCase() },
    { provide: ManageSuppressedEmailUseCase, useFactory: () => new ManageSuppressedEmailUseCase() },
    { provide: ManageEmailTemplateUseCase, useFactory: () => new ManageEmailTemplateUseCase() },
    { provide: UpdateUserEmailPreferencesUseCase, useFactory: () => new UpdateUserEmailPreferencesUseCase() },
    {
      provide: DeleteMyAccountUseCase,
      inject: ['PRISMA', AuditLogger],
      useFactory: (prisma: any, audit: any) => new DeleteMyAccountUseCase(prisma, audit),
    },
    // Sprint 10 — Graceful shutdown koordinatörü.
    // app.enableShutdownHooks() main.ts'te aktif; SIGTERM bu service'i çağırır.
    GracefulShutdownService,
    { provide: UnsubscribeViaTokenUseCase, useFactory: () => new UnsubscribeViaTokenUseCase() },
    { provide: GetEmailTrafficMetricsUseCase, useFactory: () => new GetEmailTrafficMetricsUseCase() },
    { provide: AnonymizeOldEmailLogsUseCase, useFactory: () => new AnonymizeOldEmailLogsUseCase() },
    { provide: CheckBounceRateAlertUseCase, useFactory: () => new CheckBounceRateAlertUseCase() },
    { provide: ResetProviderDailyCountUseCase, useFactory: () => new ResetProviderDailyCountUseCase() },
    { provide: ExpireSuppressionsUseCase, useFactory: () => new ExpireSuppressionsUseCase() },
    ...(throttleDisabled ? [] : [{ provide: APP_GUARD, useClass: CustomThrottlerGuard }]),
    // OriginProtectionGuard + CaptchaGuard main.ts'te useGlobalGuards ile manuel
    // instantiate ediliyor (JwtAuthGuard ile aynı pattern — sıra önemli).
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
    { provide: ListGradeLevelsUseCase, useFactory: () => new ListGradeLevelsUseCase() },
    {
      provide: CreateGradeLevelUseCase,
      useFactory: (audit: PrismaAuditLogRepository) => new CreateGradeLevelUseCase(audit),
      inject: [PrismaAuditLogRepository],
    },
    {
      provide: UpdateGradeLevelUseCase,
      useFactory: (audit: PrismaAuditLogRepository) => new UpdateGradeLevelUseCase(audit),
      inject: [PrismaAuditLogRepository],
    },
    {
      provide: DeleteGradeLevelUseCase,
      useFactory: (audit: PrismaAuditLogRepository) => new DeleteGradeLevelUseCase(audit),
      inject: [PrismaAuditLogRepository],
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
      provide: RejectEducatorUseCase,
      useFactory: (userRepo: PrismaUserRepository, auditRepo: PrismaAuditLogRepository) => new RejectEducatorUseCase(userRepo, auditRepo),
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
      provide: AnswerObjectionByAdminUseCase,
      useFactory: (
        objectionRepo: PrismaObjectionRepository,
        auditRepo: PrismaAuditLogRepository,
      ) => new AnswerObjectionByAdminUseCase(objectionRepo, auditRepo),
      inject: [OBJECTION_REPO, PrismaAuditLogRepository],
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
    { provide: ListEducatorContentReportsUseCase, useClass: ListEducatorContentReportsUseCase },
    { provide: AnswerContentReportUseCase, useClass: AnswerContentReportUseCase },
    { provide: NoteContentReportUseCase, useClass: NoteContentReportUseCase },
    { provide: ListAllContentReportsUseCase, useClass: ListAllContentReportsUseCase },
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
    {
      provide: ListMyObjectionsUseCase,
      useFactory: (objectionRepo: PrismaObjectionRepository) => new ListMyObjectionsUseCase(objectionRepo),
      inject: [OBJECTION_REPO],
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
    {
      provide: UpdateAdminSettingsUseCase,
      useFactory: (audit: AuditLogger) => new UpdateAdminSettingsUseCase(audit),
      inject: [AuditLogger],
    },
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
    // Sprint 15 #2 — Aday paket öncesi indirim kodu doğrulama (validate, usage atmaz)
    {
      provide: ValidateDiscountCodeUseCase,
      useFactory: () => new ValidateDiscountCodeUseCase(),
    },
    // Sprint 15 #3 — Platform admin promo kodu (LIVE_SESSION + AD_PACKAGE)
    {
      provide: CreatePlatformPromoCodeUseCase,
      useFactory: (auditRepo: PrismaAuditLogRepository) =>
        new CreatePlatformPromoCodeUseCase(auditRepo),
      inject: [PrismaAuditLogRepository],
    },
    {
      provide: ListPlatformPromoCodesUseCase,
      useFactory: () => new ListPlatformPromoCodesUseCase(),
    },
    {
      provide: DeletePlatformPromoCodeUseCase,
      useFactory: (auditRepo: PrismaAuditLogRepository) =>
        new DeletePlatformPromoCodeUseCase(auditRepo),
      inject: [PrismaAuditLogRepository],
    },
    {
      provide: TogglePlatformPromoCodeUseCase,
      useFactory: (auditRepo: PrismaAuditLogRepository) =>
        new TogglePlatformPromoCodeUseCase(auditRepo),
      inject: [PrismaAuditLogRepository],
    },
    {
      provide: ValidatePlatformPromoCodeUseCase,
      useFactory: () => new ValidatePlatformPromoCodeUseCase(),
    },
    {
      provide: ListEducatorDiscountCodesUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new ListEducatorDiscountCodesUseCase(userRepo),
      inject: [USER_REPO],
    },
    {
      provide: ListAllDiscountCodesUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new ListAllDiscountCodesUseCase(userRepo),
      inject: [USER_REPO],
    },
    {
      provide: DeleteDiscountCodeUseCase,
      useFactory: (userRepo: PrismaUserRepository) => new DeleteDiscountCodeUseCase(userRepo),
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
    // Yedekleme — BackupSchedulerService SchedulerRegistry inject olur (CronModule
    // ScheduleModule.forRoot() ile registry'yi sağlar).
    BackupSchedulerService,
    { provide: GetBackupSettingsUseCase, useFactory: () => new GetBackupSettingsUseCase() },
    {
      provide: UpdateBackupSettingsUseCase,
      useFactory: (s: BackupSchedulerService) => new UpdateBackupSettingsUseCase(s),
      inject: [BackupSchedulerService],
    },
    {
      provide: RunBackupNowUseCase,
      useFactory: (s: BackupSchedulerService) => new RunBackupNowUseCase(s),
      inject: [BackupSchedulerService],
    },
    { provide: ListBackupLogsUseCase, useFactory: () => new ListBackupLogsUseCase() },
    // Admin stats dashboard — bağımlılıksız, doğrudan prisma kullanır
    GetAdminStatsUseCase,
    // LiveSession use-cases — singleton prisma kullanır, bağımlılıksız
    { provide: CreateLiveSessionUseCase, useFactory: () => new CreateLiveSessionUseCase(getSharedModerateTextContentUseCase()) },
    { provide: GetLiveSessionStateUseCase, useFactory: () => new GetLiveSessionStateUseCase() },
    // Aday kişisel notları
    { provide: CreateCandidateNoteUseCase, useFactory: () => new CreateCandidateNoteUseCase() },
    { provide: ListCandidateNotesUseCase, useFactory: () => new ListCandidateNotesUseCase() },
    { provide: GetCandidateNoteFacetsUseCase, useFactory: () => new GetCandidateNoteFacetsUseCase() },
    { provide: UpdateCandidateNoteUseCase, useFactory: () => new UpdateCandidateNoteUseCase() },
    { provide: DeleteCandidateNoteUseCase, useFactory: () => new DeleteCandidateNoteUseCase() },
    // Tünel modülü
    { provide: CreateTunnelUseCase, useFactory: () => new CreateTunnelUseCase() },
    { provide: UpdateTunnelUseCase, useFactory: () => new UpdateTunnelUseCase() },
    { provide: SaveTunnelQuestionsUseCase, useFactory: () => new SaveTunnelQuestionsUseCase(getSharedModerateTextContentUseCase()) },
    { provide: SubmitTunnelForApprovalUseCase, useFactory: () => new SubmitTunnelForApprovalUseCase() },
    { provide: GetTunnelUseCase, useFactory: () => new GetTunnelUseCase() },
    { provide: ListEducatorTunnelsUseCase, useFactory: () => new ListEducatorTunnelsUseCase() },
    { provide: ListPendingTunnelsUseCase, useFactory: () => new ListPendingTunnelsUseCase() },
    { provide: ApproveTunnelUseCase, useFactory: () => new ApproveTunnelUseCase() },
    { provide: RejectTunnelUseCase, useFactory: () => new RejectTunnelUseCase() },
    // Tünel Faz 2 — aday akışı
    { provide: ListPublishedTunnelsUseCase, useFactory: () => new ListPublishedTunnelsUseCase() },
    { provide: GetPublishedTunnelMetaUseCase, useFactory: () => new GetPublishedTunnelMetaUseCase() },
    { provide: PurchaseTunnelUseCase, useFactory: () => new PurchaseTunnelUseCase() },
    { provide: ValidateTunnelDiscountUseCase, useFactory: () => new ValidateTunnelDiscountUseCase() },
    { provide: StartTunnelAttemptUseCase, useFactory: () => new StartTunnelAttemptUseCase() },
    { provide: GetTunnelAttemptStateUseCase, useFactory: () => new GetTunnelAttemptStateUseCase() },
    { provide: SubmitTunnelAnswerUseCase, useFactory: () => new SubmitTunnelAnswerUseCase() },
    { provide: ReportTunnelQuestionUseCase, useFactory: () => new ReportTunnelQuestionUseCase() },
    { provide: GetCandidateTunnelReportsUseCase, useFactory: () => new GetCandidateTunnelReportsUseCase() },
    { provide: ListMyTunnelQuestionReportsUseCase, useFactory: () => new ListMyTunnelQuestionReportsUseCase() },
    { provide: UpsertTunnelReviewUseCase, useFactory: () => new UpsertTunnelReviewUseCase(getSharedModerateTextContentUseCase()) },
    { provide: ListTunnelReviewsUseCase, useFactory: () => new ListTunnelReviewsUseCase() },
    { provide: GetMyTunnelReviewUseCase, useFactory: () => new GetMyTunnelReviewUseCase() },
    // Yazılı Test modülü
    { provide: CreateWrittenPackageUseCase, useFactory: () => new CreateWrittenPackageUseCase() },
    { provide: UpdateWrittenPackageUseCase, useFactory: () => new UpdateWrittenPackageUseCase() },
    { provide: PublishWrittenPackageUseCase, useFactory: () => new PublishWrittenPackageUseCase() },
    { provide: UnpublishWrittenPackageUseCase, useFactory: () => new UnpublishWrittenPackageUseCase() },
    { provide: ListEducatorWrittenPackagesUseCase, useFactory: () => new ListEducatorWrittenPackagesUseCase() },
    { provide: GetWrittenPackageUseCase, useFactory: () => new GetWrittenPackageUseCase() },
    { provide: CreateWrittenTestUseCase, useFactory: () => new CreateWrittenTestUseCase() },
    { provide: UpdateWrittenTestUseCase, useFactory: () => new UpdateWrittenTestUseCase() },
    { provide: DeleteWrittenTestUseCase, useFactory: () => new DeleteWrittenTestUseCase() },
    { provide: CreateWrittenQuestionUseCase, useFactory: () => new CreateWrittenQuestionUseCase(getSharedModerateTextContentUseCase()) },
    { provide: UpdateWrittenQuestionUseCase, useFactory: () => new UpdateWrittenQuestionUseCase(getSharedModerateTextContentUseCase()) },
    { provide: DeleteWrittenQuestionUseCase, useFactory: () => new DeleteWrittenQuestionUseCase() },
    { provide: PurchaseWrittenPackageUseCase, useFactory: () => new PurchaseWrittenPackageUseCase() },
    { provide: ValidateWrittenDiscountUseCase, useFactory: () => new ValidateWrittenDiscountUseCase() },
    { provide: StartWrittenAttemptUseCase, useFactory: () => new StartWrittenAttemptUseCase() },
    { provide: SubmitWrittenAnswerUseCase, useFactory: () => new SubmitWrittenAnswerUseCase() },
    { provide: GetWrittenAttemptStateUseCase, useFactory: () => new GetWrittenAttemptStateUseCase() },
    { provide: SubmitWrittenAttemptUseCase, useFactory: () => new SubmitWrittenAttemptUseCase() },
    { provide: TimeoutWrittenAttemptUseCase, useFactory: () => new TimeoutWrittenAttemptUseCase() },
    { provide: GetWrittenQuestionSolutionUseCase, useFactory: () => new GetWrittenQuestionSolutionUseCase() },
    { provide: ReportWrittenQuestionUseCase, useFactory: () => new ReportWrittenQuestionUseCase() },
    { provide: ListMyWrittenQuestionReportsUseCase, useFactory: () => new ListMyWrittenQuestionReportsUseCase() },
    { provide: ListPublishedWrittenPackagesUseCase, useFactory: () => new ListPublishedWrittenPackagesUseCase() },
    { provide: GetPublishedWrittenPackageUseCase, useFactory: () => new GetPublishedWrittenPackageUseCase() },
    { provide: ListMyWrittenPurchasesUseCase, useFactory: () => new ListMyWrittenPurchasesUseCase() },
    { provide: UpsertWrittenReviewUseCase, useFactory: () => new UpsertWrittenReviewUseCase(getSharedModerateTextContentUseCase()) },
    { provide: ListWrittenReviewsUseCase, useFactory: () => new ListWrittenReviewsUseCase() },
    { provide: GetMyWrittenReviewUseCase, useFactory: () => new GetMyWrittenReviewUseCase() },
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
    {
      provide: GoogleAuthUseCase,
      useFactory: (userRepo: PrismaUserRepository, pwd: PasswordService, jwt: AppJwtService) =>
        new GoogleAuthUseCase(userRepo, pwd, jwt, process.env.GOOGLE_CLIENT_ID),
      inject: [USER_REPO, PasswordService, AppJwtService],
    },
    DisableTwoFactorUseCase,
  ],
})
export class AppModule {}
