import { Module } from '@nestjs/common';
import { TestsController } from '../../controllers/tests.controller';
import { TestsService } from './tests.service';
import { TestPublishProvider } from './test-publish.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { TestPublishService as AppTestPublishService } from '../../../application/services/TestPublishService';
import { CreateTestUseCase } from '../../../application/use-cases/test/CreateTestUseCase';
import { CreateQuestionUseCase } from '../../../application/use-cases/question/CreateQuestionUseCase';
import { ListMarketplaceTestsUseCase } from '../../../application/use-cases/test/ListMarketplaceTestsUseCase';
import { GetTestUseCase } from '../../../application/use-cases/test/GetTestUseCase';
import { PublishTestUseCase } from '../../../application/use-cases/test/PublishTestUseCase';
import { UnpublishTestUseCase } from '../../../application/use-cases/test/UnpublishTestUseCase';
import { UpdateTestUseCase } from '../../../application/use-cases/test/UpdateTestUseCase';
import { UpdateQuestionUseCase } from '../../../application/use-cases/question/UpdateQuestionUseCase';
import { UpdateOptionUseCase } from '../../../application/use-cases/question/UpdateOptionUseCase';
import { DeleteQuestionUseCase } from '../../../application/use-cases/question/DeleteQuestionUseCase';
import { PrismaExamRepository } from '../../../infrastructure/repositories/PrismaExamRepository';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';
import { PrismaUserRepository } from '../../../infrastructure/repositories/PrismaUserRepository';
import { PrismaAttemptRepository } from '../../../infrastructure/repositories/PrismaAttemptRepository';
import { PrismaExamTypeRepository } from '../../../infrastructure/repositories/PrismaExamTypeRepository';
import { PrismaTopicRepository } from '../../../infrastructure/repositories/PrismaTopicRepository';
import { EXAM_TYPE_REPO, TOPIC_REPO, USER_REPO } from '../../../application/constants';
import { ContentSafetyModule } from '../content-safety/content-safety.module';
import { ModerateQuestionContentUseCase } from '../../../application/use-cases/moderation/ModerateQuestionContentUseCase';

@Module({
  imports: [PrismaModule, ContentSafetyModule],
  controllers: [TestsController],
  providers: [
    TestsService,
    TestPublishProvider,
    {
      provide: AppTestPublishService,
      useClass: TestPublishProvider,
    },
    { provide: EXAM_TYPE_REPO, useClass: PrismaExamTypeRepository },
    { provide: TOPIC_REPO, useClass: PrismaTopicRepository },
    PrismaExamRepository,
    PrismaAuditLogRepository,
    {
      provide: CreateTestUseCase,
      useFactory: (examRepo: PrismaExamRepository, examTypeRepo: PrismaExamTypeRepository, topicRepo: PrismaTopicRepository) =>
        new CreateTestUseCase(examRepo, examTypeRepo, topicRepo),
      inject: [PrismaExamRepository, EXAM_TYPE_REPO, TOPIC_REPO],
    },
    {
      provide: CreateQuestionUseCase,
      useFactory: (examRepo: PrismaExamRepository, moderateUC: ModerateQuestionContentUseCase) =>
        new CreateQuestionUseCase(examRepo, moderateUC),
      inject: [PrismaExamRepository, ModerateQuestionContentUseCase],
    },
    {
      provide: ListMarketplaceTestsUseCase,
      useFactory: (examRepo: PrismaExamRepository) => new ListMarketplaceTestsUseCase(examRepo),
      inject: [PrismaExamRepository],
    },
    {
      provide: GetTestUseCase,
      useFactory: (examRepo: PrismaExamRepository) => new GetTestUseCase(examRepo),
      inject: [PrismaExamRepository],
    },
    {
      provide: PublishTestUseCase,
      useFactory: (examRepo: PrismaExamRepository, auditRepo: PrismaAuditLogRepository, userRepo: PrismaUserRepository) =>
        new PublishTestUseCase(examRepo, auditRepo, userRepo),
      inject: [PrismaExamRepository, PrismaAuditLogRepository, USER_REPO],
    },
    { provide: USER_REPO, useClass: PrismaUserRepository },
    {
      provide: UnpublishTestUseCase,
      useFactory: (examRepo: PrismaExamRepository, auditRepo: PrismaAuditLogRepository) =>
        new UnpublishTestUseCase(examRepo, auditRepo),
      inject: [PrismaExamRepository, PrismaAuditLogRepository],
    },
    PrismaAttemptRepository,
    {
      provide: UpdateTestUseCase,
      useFactory: (examRepo: PrismaExamRepository, auditRepo: PrismaAuditLogRepository, userRepo: PrismaUserRepository) =>
        new UpdateTestUseCase(examRepo, auditRepo, userRepo),
      inject: [PrismaExamRepository, PrismaAuditLogRepository, USER_REPO],
    },
    {
      provide: UpdateQuestionUseCase,
      useFactory: (examRepo: PrismaExamRepository, userRepo: PrismaUserRepository, attemptRepo: PrismaAttemptRepository, moderateUC: ModerateQuestionContentUseCase) =>
        new UpdateQuestionUseCase(examRepo, userRepo, attemptRepo, moderateUC),
      inject: [PrismaExamRepository, USER_REPO, PrismaAttemptRepository, ModerateQuestionContentUseCase],
    },
    {
      provide: UpdateOptionUseCase,
      useFactory: (examRepo: PrismaExamRepository, userRepo: PrismaUserRepository, attemptRepo: PrismaAttemptRepository) =>
        new UpdateOptionUseCase(examRepo, userRepo, attemptRepo),
      inject: [PrismaExamRepository, USER_REPO, PrismaAttemptRepository],
    },
    {
      provide: DeleteQuestionUseCase,
      useFactory: () => new DeleteQuestionUseCase(),
    },
  ],
  exports: [TestsService],
})
export class TestsModule {}

