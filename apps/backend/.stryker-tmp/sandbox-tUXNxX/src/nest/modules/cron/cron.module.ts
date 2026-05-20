// @ts-nocheck
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CronService } from './cron.service';
import { PrismaNotificationPreferenceRepository } from '../../../infrastructure/repositories/PrismaNotificationPreferenceRepository';
import { PrismaFollowRepository } from '../../../infrastructure/repositories/PrismaFollowRepository';
import { PrismaUserRepository } from '../../../infrastructure/repositories/PrismaUserRepository';
import { PrismaObjectionRepository } from '../../../infrastructure/repositories/PrismaObjectionRepository';
import { QueueService } from '../../../infrastructure/queue/queue.service';
import { SendWeeklyFollowDigestUseCase } from '../../../application/use-cases/notification/SendWeeklyFollowDigestUseCase';
import { SendMonthlyInactiveReminderUseCase } from '../../../application/use-cases/notification/SendMonthlyInactiveReminderUseCase';
import { EscalateOverdueObjectionsUseCase } from '../../../application/use-cases/objection/EscalateOverdueObjectionsUseCase';
import { EscalateOverdueRefundsUseCase } from '../../../application/use-cases/refund/EscalateOverdueRefundsUseCase';
import { PrismaRefundRepository } from '../../../infrastructure/repositories/PrismaRefundRepository';
import { PrismaAuditLogRepository } from '../../../infrastructure/repositories/PrismaAuditLogRepository';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    CronService,
    PrismaNotificationPreferenceRepository,
    PrismaFollowRepository,
    PrismaUserRepository,
    PrismaObjectionRepository,
    PrismaAuditLogRepository,
    QueueService,
    {
      provide: SendWeeklyFollowDigestUseCase,
      useFactory: (f: PrismaFollowRepository, p: PrismaNotificationPreferenceRepository, q: QueueService, a: PrismaAuditLogRepository) =>
        new SendWeeklyFollowDigestUseCase(f, p, q, a),
      inject: [PrismaFollowRepository, PrismaNotificationPreferenceRepository, QueueService, PrismaAuditLogRepository],
    },
    {
      provide: SendMonthlyInactiveReminderUseCase,
      useFactory: (u: PrismaUserRepository, p: PrismaNotificationPreferenceRepository, q: QueueService, a: PrismaAuditLogRepository) =>
        new SendMonthlyInactiveReminderUseCase(u, p, q, a),
      inject: [PrismaUserRepository, PrismaNotificationPreferenceRepository, QueueService, PrismaAuditLogRepository],
    },
    {
      provide: EscalateOverdueObjectionsUseCase,
      useFactory: (o: PrismaObjectionRepository, a: PrismaAuditLogRepository) => new EscalateOverdueObjectionsUseCase(o, a),
      inject: [PrismaObjectionRepository, PrismaAuditLogRepository],
    },
    PrismaRefundRepository,
    {
      provide: EscalateOverdueRefundsUseCase,
      useFactory: (r: PrismaRefundRepository) => new EscalateOverdueRefundsUseCase(r),
      inject: [PrismaRefundRepository],
    },
  ],
  exports: [CronService],
})
export class CronModule {}

