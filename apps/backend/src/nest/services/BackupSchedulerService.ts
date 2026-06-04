import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { validateCronExpression } from 'cron';
import { prisma } from '../../infrastructure/database/prisma';
import { BackupService } from '../../application/services/backup/BackupService';

const JOB_NAME = 'admin-configured-backup';

export const isValidCronExpression = (expr: string): boolean => {
  if (!expr || typeof expr !== 'string') return false;
  const trimmed = expr.trim();
  // POSIX cron 5-alan strict (dakika saat gün ay haftaGünü). cron paketinin
  // validateCronExpression'ı 2/6-alan formatlarını da kabul ediyor — admin
  // panelinden tutarsız girdi gelmesin diye burada sıkılaştırıyoruz.
  if (trimmed.split(/\s+/).length !== 5) return false;
  const result = validateCronExpression(trimmed);
  return result.valid;
};

/**
 * AdminSettings.backupCronExpression'ı runtime'da okur ve SchedulerRegistry
 * üzerinden cron job kaydeder/günceller. OnModuleInit'te boot anında okur;
 * UpdateBackupSettingsUseCase ayar değiştiğinde reload() çağırır.
 */
@Injectable()
export class BackupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    private readonly registry: SchedulerRegistry,
    // BackupService DI'a kayıtlı değil; manuel default instantiation ile sağlanır.
    // @Optional() olmadan Nest paramtype'ı görüp container'da arar ve patlar.
    @Optional() private readonly backupService: BackupService = new BackupService(),
  ) {}

  async onModuleInit() {
    await this.reload().catch((err) => {
      this.logger.error(`Backup scheduler boot hatası: ${err?.message || err}`);
    });
  }

  /**
   * AdminSettings'i okuyup mevcut cron job'u söker; aktifse yeni job kaydeder.
   * UpdateBackupSettingsUseCase her değişiklikte çağırır.
   */
  async reload(): Promise<void> {
    this.removeIfExists();

    const settings = await prisma.adminSettings.findUnique({ where: { id: 1 } });
    if (!settings) return;
    if (!settings.backupEnabled) return;
    const expr = settings.backupCronExpression?.trim();
    if (!expr || !settings.backupTargetDir?.trim()) return;

    if (!isValidCronExpression(expr)) {
      this.logger.warn(`Geçersiz cron expression: "${expr}" — backup zamanlanmadı`);
      return;
    }

    const job = new CronJob(expr, () => {
      this.backupService
        .run({ trigger: 'SCHEDULED' })
        .then((r) =>
          this.logger.log(
            r.success
              ? `Backup OK: ${r.fileName} (${r.sizeBytes} B, ${r.durationMs} ms)`
              : `Backup FAILED: ${r.error}`,
          ),
        )
        .catch((e) => this.logger.error(`Backup cron exception: ${e?.message || e}`));
    });

    this.registry.addCronJob(JOB_NAME, job as any);
    job.start();
    this.logger.log(`Backup cron kaydedildi: "${expr}" → ${settings.backupTargetDir}`);
  }

  /** Test/manuel kullanım için scheduler dışında doğrudan tetik. */
  async runNow(actorId: string): Promise<{ logId: string; success: boolean; error?: string }> {
    const result = await this.backupService.run({ trigger: 'MANUAL', actorId });
    return { logId: result.logId, success: result.success, error: result.error };
  }

  private removeIfExists() {
    try {
      const existing = this.registry.getCronJob(JOB_NAME);
      if (existing) {
        existing.stop();
        this.registry.deleteCronJob(JOB_NAME);
      }
    } catch {
      // job yoksa SchedulerRegistry exception fırlatır — yoksay
    }
  }
}
