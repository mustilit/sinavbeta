import { Job, Worker } from 'bullmq';
import http from 'http';
import { getRedisConnectionOptions, validateRedisUrl } from '../../config/redis';
import {
  EMAIL_BULK_QUEUE,
  EMAIL_CRITICAL_QUEUE,
  EMAIL_NOTIFY_QUEUE,
  EMAIL_QUEUE_CONFIG,
  EmailQueueName,
} from './queue.constants';
import {
  EmailJobPayload,
} from '../../application/services/email/EmailQueueProducer';
import { SendEmailJobProcessor } from '../../application/services/email/workers/SendEmailJobProcessor';
import { prisma } from '../database/prisma';

if (process.env.REDIS_DISABLED === '1' || process.env.REDIS_DISABLED === 'true') {
  // eslint-disable-next-line no-console
  console.log('[EmailTraffic Worker] Redis disabled; exiting.');
  process.exit(0);
}

validateRedisUrl();

const WORKER_PORT = parseInt(process.env.EMAIL_TRAFFIC_WORKER_PORT || '3011', 10);
const connection = getRedisConnectionOptions();
const processor = new SendEmailJobProcessor();

const workers: Worker<EmailJobPayload>[] = [];

function startQueueWorker(name: EmailQueueName) {
  const cfg = EMAIL_QUEUE_CONFIG[name];
  const worker = new Worker<EmailJobPayload>(
    name,
    async (job: Job<EmailJobPayload>) => {
      const isFinalAttempt = (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);
      const result = await processor.process({
        emailLogId: job.data.emailLogId,
        tenantId: job.data.tenantId,
        isFinalAttempt,
      });
      if (result.status === 'FAILED') {
        // BullMQ retry tetiklensin diye throw et — final attempt'ta status DEAD_LETTER yazılır.
        throw new Error(`${result.errorCode}: ${result.errorMessage}`);
      }
      return result;
    },
    {
      connection: connection as any,
      concurrency: cfg.concurrency,
      limiter: { max: cfg.rateMax, duration: cfg.rateDurationMs },
    },
  );

  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[EmailTraffic Worker] ${name} job failed`, job?.id, err?.message);
  });

  workers.push(worker);
  // eslint-disable-next-line no-console
  console.log(`[EmailTraffic Worker] Started: ${name} (concurrency=${cfg.concurrency})`);
}

function startHealth() {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, queues: workers.map((w) => w.name) }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(WORKER_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[EmailTraffic Worker] Health server :${WORKER_PORT}`);
  });
  return server;
}

const server = startHealth();
startQueueWorker(EMAIL_CRITICAL_QUEUE);
startQueueWorker(EMAIL_NOTIFY_QUEUE);
startQueueWorker(EMAIL_BULK_QUEUE);

async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`[EmailTraffic Worker] ${signal} received, draining...`);
  try {
    await Promise.allSettled(workers.map((w) => w.close()));
    server.close();
    await prisma.$disconnect();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('shutdown error', err);
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled rejection in email traffic worker', err);
});
