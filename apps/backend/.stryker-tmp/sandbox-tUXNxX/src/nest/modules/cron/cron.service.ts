// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SendWeeklyFollowDigestUseCase } from '../../../application/use-cases/notification/SendWeeklyFollowDigestUseCase';
import { SendMonthlyInactiveReminderUseCase } from '../../../application/use-cases/notification/SendMonthlyInactiveReminderUseCase';
import { EscalateOverdueObjectionsUseCase } from '../../../application/use-cases/objection/EscalateOverdueObjectionsUseCase';
import { EscalateOverdueRefundsUseCase } from '../../../application/use-cases/refund/EscalateOverdueRefundsUseCase';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);
  constructor(
    private readonly weekly: SendWeeklyFollowDigestUseCase,
    private readonly monthly: SendMonthlyInactiveReminderUseCase,
    private readonly escalate: EscalateOverdueObjectionsUseCase,
    private readonly escalateRefunds: EscalateOverdueRefundsUseCase,
  ) {}

  @Cron('0 0 20 * * 5') // Friday 20:00
  async handleWeeklyDigest() {
    if (process.env.CRON_DISABLED === '1') return;
    this.logger.log('Running weekly follow digest');
    try {
      const res = await this.weekly.execute();
      this.logger.log(`Weekly digest enqueued=${res.enqueued}`);
    } catch (e) {
      this.logger.error('Weekly digest failed', e as any);
    }
  }

  @Cron('0 0 10 1 * *') // 1st every month 10:00
  async handleMonthlyReminder() {
    if (process.env.CRON_DISABLED === '1') return;
    this.logger.log('Running monthly inactive reminder');
    try {
      const res = await this.monthly.execute();
      this.logger.log(`Monthly reminders enqueued=${res.enqueued}`);
    } catch (e) {
      this.logger.error('Monthly reminder failed', e as any);
    }
  }

  @Cron('0 0 2 * * *') // daily 02:00 for escalation
  async handleEscalations() {
    if (process.env.CRON_DISABLED === '1') return;
    this.logger.log('Running objection escalation');
    try {
      const res = await this.escalate.execute(10);
      this.logger.log(`Escalated count=${res.count}`);
    } catch (e) {
      this.logger.error('Escalation failed', e as any);
    }
  }

  @Cron('0 30 2 * * *') // daily 02:30 for refund deadline escalation
  async handleRefundEscalations() {
    if (process.env.CRON_DISABLED === '1') return;
    this.logger.log('Running refund educator deadline escalation');
    try {
      const res = await this.escalateRefunds.execute();
      this.logger.log(`Refund escalated count=${res.escalated}`);
    } catch (e) {
      this.logger.error('Refund escalation failed', e as any);
    }
  }
}

