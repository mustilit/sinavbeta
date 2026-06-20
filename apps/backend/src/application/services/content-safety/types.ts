import { ModerationCategory, ModerationStatus } from '@prisma/client';

// ── Giriş tipleri ──────────────────────────────────────────────────────────────

export type EntityType =
  | 'ExamQuestion'
  | 'ExamOption'
  | 'ExamTest'
  | 'Review'
  | 'EducatorProfile'
  | 'LiveQuestion'
  | 'WrittenQuestion'
  | 'WrittenReview'
  | 'TunnelQuestion'
  | 'TunnelReview';

export interface ModerationInput {
  entityType: EntityType;
  entityId: string;
  userId: string;
  tenantId: string;
  /** Metin içeriği — text provider'lar için zorunlu */
  text?: string;
  /** Görsel URL veya base64 — vision provider için */
  imageUrl?: string;
  imageBuffer?: Buffer;
  imageMediaType?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

// ── Katman 1 (kural tabanlı / NSFW) çıktı ──────────────────────────────────────

export type Layer1Status = 'APPROVED' | 'REJECTED' | 'SUSPECT';

export interface Layer1Result {
  status: Layer1Status;
  /** Eşleşen yasaklı terimler (BlocklistTextProvider'dan) */
  matchedTerms?: string[];
  /** En yüksek önem seviyesi (1-5) */
  maxSeverity?: number;
  categories: ModerationCategory[];
  /** NSFW sınıf olasılıkları (NsfwjsImageProvider'dan) */
  nsfwScores?: Record<string, number>;
}

// ── Katman 2 (Claude AI) çıktı ─────────────────────────────────────────────────

export interface AiModerationScore {
  /** Nefret söylemi olasılığı 0-1 */
  hate: number;
  /** Cinsel içerik olasılığı 0-1 */
  sexual: number;
  /** Şiddet içeriği olasılığı 0-1 */
  violence: number;
  /** Kişisel veri içeriği olasılığı 0-1 */
  personalData: number;
  /** Spam/reklam olasılığı 0-1 */
  spam: number;
  /** Genel ihlal skoru 0-1 */
  overall: number;
}

export interface Layer2Result {
  scores: AiModerationScore;
  categories: ModerationCategory[];
  /** Claude'un kararı: APPROVED | REJECTED | SUSPECT */
  verdict: Layer1Status;
  /** Moderatör için açıklama */
  reasoning: string;
  /** Ham AI yanıtı (debug için) */
  raw: unknown;
  /** Tahmini maliyet (USD, yaklaşık) */
  costUsd: number | null;
  /** Gecikme (ms) */
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

// ── Orchestrator çıktı ─────────────────────────────────────────────────────────

export type ModerationDecision =
  | 'APPROVED'
  | 'REJECTED'
  | 'PENDING_REVIEW'
  | 'MANUAL_REVIEW'
  | 'SKIPPED';

export interface ModerationOutcome {
  decision: ModerationDecision;
  /** Nihai ModerationStatus (Prisma enum ile uyumlu) */
  status: ModerationStatus;
  layer1Result?: Layer1Result;
  layer2Result?: Layer2Result;
  /** Layer2 için kuyruğa gönderildi mi */
  enqueuedForLayer2: boolean;
  /** Moderasyon devre dışıysa true */
  skipped: boolean;
}

// ── Provider token sabitleri (NestJS DI) ──────────────────────────────────────

export const MODERATION_TEXT_PROVIDER = 'IModerationTextProvider';
export const MODERATION_IMAGE_PROVIDER = 'IModerationImageProvider';
export const BLOCKED_TERM_REPO = 'IBlockedTermRepository';
export const MODERATION_RESULT_REPO = 'IModerationResultRepository';
