import { Queue } from 'bullmq';
import { getRedisConnectionOptions, isRedisDisabled } from '../../../../config/redis';
import { ModerationCategory } from '@prisma/client';
import { Layer1Result } from '../types';

// ── Kuyruk sabitleri ──────────────────────────────────────────────────────────

export const MODERATION_QUEUE_NAME =
  process.env.MODERATION_REDIS_QUEUE_NAME ?? 'moderation';

// ── Job tipleri ───────────────────────────────────────────────────────────────

export type ModerationJobType = 'text-moderation' | 'image-moderation';

export interface TextModerationJobPayload {
  type: 'text-moderation';
  resultId: string;
  entityType: string;
  entityId: string;
  userId: string;
  tenantId: string;
  content: string;
  /** Claude için model adı (AdminSettings'ten gelir) */
  modelName: string;
  l1Result: Layer1Result;
}

export interface ImageModerationJobPayload {
  type: 'image-moderation';
  resultId: string;
  entityType: string;
  entityId: string;
  userId: string;
  tenantId: string;
  imageUrl: string;
  /** Claude için model adı */
  modelName: string;
  l1Result: Layer1Result;
}

export type ModerationJobPayload =
  | TextModerationJobPayload
  | ImageModerationJobPayload;

// ── Queue singleton (producer) ─────────────────────────────────────────────────

let _moderationQueue: Queue | null = null;

function getModerationQueue(): Queue | null {
  if (isRedisDisabled()) return null;
  if (_moderationQueue) return _moderationQueue;

  const connection = getRedisConnectionOptions();
  _moderationQueue = new Queue(MODERATION_QUEUE_NAME, {
    connection: connection as any,
    defaultJobOptions: {
      attempts: Number(process.env.MODERATION_MAX_RETRY ?? '3'),
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });

  return _moderationQueue;
}

/**
 * Metin moderasyon işini kuyruğa ekler.
 * Redis devre dışıysa sessizce pas geçer ve false döner.
 */
export async function enqueueModerationJob(
  payload: ModerationJobPayload,
): Promise<boolean> {
  const queue = getModerationQueue();
  if (!queue) return false;

  await queue.add(payload.type, payload, {
    jobId: `${payload.type}:${payload.resultId}`,
  });
  return true;
}
