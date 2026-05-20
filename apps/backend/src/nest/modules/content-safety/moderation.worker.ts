import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions, isRedisDisabled } from '../../../config/redis';
import { MODERATION_QUEUE_NAME, ModerationJobPayload } from '../../../application/services/content-safety/utils/moderationQueue';
import { ProcessModerationJobUseCase } from '../../../application/use-cases/moderation/ProcessModerationJobUseCase';

@Injectable()
export class ModerationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModerationWorker.name);
  private worker: Worker | null = null;

  constructor(private readonly processJobUC: ProcessModerationJobUseCase) {}

  onModuleInit() {
    if (isRedisDisabled()) {
      this.logger.warn('Redis devre dışı — ModerationWorker başlatılmıyor');
      return;
    }

    const connection = getRedisConnectionOptions();
    const maxRetry = Number(process.env.MODERATION_MAX_RETRY ?? '3');

    this.worker = new Worker(
      MODERATION_QUEUE_NAME,
      async (job: Job<ModerationJobPayload>) => {
        this.logger.log(`[ModerationWorker] İşleniyor: ${job.name} / jobId=${job.id}`);
        await this.processJobUC.execute(job.data);
        this.logger.log(`[ModerationWorker] Tamamlandı: jobId=${job.id}`);
      },
      {
        connection: connection as any,
        concurrency: 2,
        limiter: { max: 10, duration: 60_000 }, // dakikada max 10
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`[ModerationWorker] Başarısız: jobId=${job?.id}`, err?.message);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('[ModerationWorker] Kapatıldı');
    }
  }
}
