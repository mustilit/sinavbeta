import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnonymizeOldEmailLogsUseCase } from '../../../application/use-cases/email/AnonymizeOldEmailLogsUseCase';
import { CheckBounceRateAlertUseCase } from '../../../application/use-cases/email/CheckBounceRateAlertUseCase';
import { ResetProviderDailyCountUseCase } from '../../../application/use-cases/email/ResetProviderDailyCountUseCase';
import { ExpireSuppressionsUseCase } from '../../../application/use-cases/email/ExpireSuppressionsUseCase';

/**
 * Email modülünün cron tetikleyicileri.
 * CRON_DISABLED=1 ile globalde kapatılır.
 */
@Injectable()
export class EmailCronService {
  private readonly logger = new Logger(EmailCronService.name);

  constructor(
    private readonly bounceCheck: CheckBounceRateAlertUseCase,
    private readonly dailyReset: ResetProviderDailyCountUseCase,
    private readonly anonymize: AnonymizeOldEmailLogsUseCase,
    private readonly expireSupp: ExpireSuppressionsUseCase,
  ) {}

  /** Her dakika — bounce rate eşik kontrolü. */
  @Cron('0 * * * * *')
  async handleBounceCheck() {
    if (process.env.CRON_DISABLED === '1') return;
    try {
      const res = await this.bounceCheck.execute();
      if (res.action !== 'no_action') {
        this.logger.warn(`Bounce alert: ${res.action} rate=${res.rate}`);
      }
    } catch (e) {
      this.logger.error('Bounce check failed', e as any);
    }
  }

  /** Her gün 00:05 UTC — sağlayıcı günlük cap sayaçlarını sıfırla. */
  @Cron('0 5 0 * * *')
  async handleDailyReset() {
    if (process.env.CRON_DISABLED === '1') return;
    try {
      const res = await this.dailyReset.execute();
      this.logger.log(`Provider daily counts reset=${res.reset}`);
    } catch (e) {
      this.logger.error('Daily reset failed', e as any);
    }
  }

  /** Her gün 02:00 — retentionDays sonra body alanlarını anonimleştir. */
  @Cron('0 0 2 * * *')
  async handleAnonymize() {
    if (process.env.CRON_DISABLED === '1') return;
    try {
      const res = await this.anonymize.execute();
      this.logger.log(`EmailLogs anonymized=${res.anonymized}`);
    } catch (e) {
      this.logger.error('Anonymize failed', e as any);
    }
  }

  /** Her gün 03:00 — süresi dolan SuppressedEmail'leri sil. */
  @Cron('0 0 3 * * *')
  async handleExpireSuppressions() {
    if (process.env.CRON_DISABLED === '1') return;
    try {
      const res = await this.expireSupp.execute();
      if (res.expired > 0) {
        this.logger.log(`Expired suppressions removed=${res.expired}`);
      }
    } catch (e) {
      this.logger.error('Expire suppressions failed', e as any);
    }
  }
}
