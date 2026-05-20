export const EMAIL_QUEUE = 'email-queue';
export const EMAIL_DLQ = 'email-dlq';
export const STATS_QUEUE = 'stats-queue';

// ── Email Trafiği Modülü — kuyruk isimleri ──────────────────────────
// Üç ayrı kuyruk, ayrı concurrency + rate-limit. CRITICAL en yüksek öncelikli.
const QUEUE_PREFIX = process.env.EMAIL_REDIS_QUEUE_PREFIX || 'email';
export const EMAIL_CRITICAL_QUEUE = `${QUEUE_PREFIX}-critical`;
export const EMAIL_NOTIFY_QUEUE = `${QUEUE_PREFIX}-notify`;
export const EMAIL_BULK_QUEUE = `${QUEUE_PREFIX}-bulk`;

export const EMAIL_QUEUE_NAMES = [
  EMAIL_CRITICAL_QUEUE,
  EMAIL_NOTIFY_QUEUE,
  EMAIL_BULK_QUEUE,
] as const;

export type EmailQueueName = (typeof EMAIL_QUEUE_NAMES)[number];

export const EMAIL_QUEUE_CONFIG: Record<
  EmailQueueName,
  { concurrency: number; rateMax: number; rateDurationMs: number; attempts: number }
> = {
  [EMAIL_CRITICAL_QUEUE]: { concurrency: 5, rateMax: 60, rateDurationMs: 60_000, attempts: 3 },
  [EMAIL_NOTIFY_QUEUE]: { concurrency: 3, rateMax: 30, rateDurationMs: 60_000, attempts: 3 },
  [EMAIL_BULK_QUEUE]: { concurrency: 1, rateMax: 30, rateDurationMs: 60_000, attempts: 2 },
};

