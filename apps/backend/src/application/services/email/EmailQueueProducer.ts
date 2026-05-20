import { EmailQueue } from '@prisma/client';
import { Queue } from 'bullmq';
import { getRedisConnectionOptions, isRedisDisabled } from '../../../config/redis';
import {
  EMAIL_BULK_QUEUE,
  EMAIL_CRITICAL_QUEUE,
  EMAIL_NOTIFY_QUEUE,
  EMAIL_QUEUE_CONFIG,
  EmailQueueName,
} from '../../../infrastructure/queue/queue.constants';

export type EmailJobPayload = {
  emailLogId: string;
  tenantId: string;
  attemptNo?: number;
};

export class EmailQueueProducer {
  private queues = new Map<EmailQueueName, Queue<EmailJobPayload>>();

  /**
   * EmailLog kaydı üretildikten sonra ilgili kuyruğa job düşürür.
   * `delayMs` verilirse o kadar gecikmeyle planlanır (gönderim saat penceresi için).
   * Redis kapalıysa sessizce no-op (test/dev).
   */
  async enqueue(
    queue: EmailQueue,
    payload: EmailJobPayload,
    opts?: { delayMs?: number },
  ): Promise<void> {
    if (isRedisDisabled()) return;
    const queueName = this.resolveQueueName(queue);
    const q = this.getOrCreate(queueName);
    const cfg = EMAIL_QUEUE_CONFIG[queueName];
    const delay = Math.max(0, opts?.delayMs ?? 0);
    await q.add('send-email', payload, {
      attempts: cfg.attempts,
      backoff: { type: 'exponential', delay: 60_000 }, // 60s → 300s → 1500s
      removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
      removeOnFail: false,
      ...(delay > 0 ? { delay } : {}),
    });
  }

  private resolveQueueName(q: EmailQueue): EmailQueueName {
    switch (q) {
      case 'CRITICAL':
        return EMAIL_CRITICAL_QUEUE;
      case 'NOTIFY':
        return EMAIL_NOTIFY_QUEUE;
      case 'BULK':
        return EMAIL_BULK_QUEUE;
    }
  }

  private getOrCreate(name: EmailQueueName): Queue<EmailJobPayload> {
    const cached = this.queues.get(name);
    if (cached) return cached;
    const connection = getRedisConnectionOptions();
    const q = new Queue<EmailJobPayload>(name, { connection: connection as any });
    this.queues.set(name, q);
    return q;
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}

let _producer: EmailQueueProducer | null = null;
export function getEmailQueueProducer(): EmailQueueProducer {
  if (!_producer) _producer = new EmailQueueProducer();
  return _producer;
}
