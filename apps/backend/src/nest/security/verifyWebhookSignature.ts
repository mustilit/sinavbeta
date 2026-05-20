/**
 * Webhook imza doğrulama yardımcıları.
 *
 * - Stripe (HMAC-SHA256 + timestamp + tolerans)
 * - Iyzico (SHA-1 base64; not: gerçek üretimde sağlayıcının güncel hash şeması teyit edilmeli)
 *
 * Timing-safe karşılaştırma için `timingSafeEqual` kullanılır — `===` ile karşılaştırma
 * timing attack açığı yaratır.
 *
 * Stripe için raw body capture şart:
 *   // apps/backend/src/nest/main.ts (veya equivalent)
 *   app.use('/webhooks/stripe', raw({ type: 'application/json' }));
 *
 * İlgili skill: docs/proposed-claude/skills/idempotency/SKILL.md (Webhook Signing bölümü)
 */
import { createHmac, createHash, timingSafeEqual } from 'crypto';

const STRIPE_TOLERANCE_SECONDS = 300; // 5 dakika

export interface VerifyResult {
  valid: boolean;
  reason?:
    | 'missing-signature'
    | 'malformed'
    | 'expired'
    | 'signature-mismatch'
    | 'missing-secret';
}

/**
 * Stripe-style signature verification.
 *
 * Header format: "t=1700000000,v1=abc123...[,v0=...]"
 *
 * @param payload   Raw request body (string, UTF-8). Buffer'dan `toString('utf8')` ile.
 * @param header    `Stripe-Signature` header değeri.
 * @param secret    `STRIPE_WEBHOOK_SECRET` env değişkeni.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | undefined,
  secret: string | undefined,
): VerifyResult {
  if (!secret) return { valid: false, reason: 'missing-secret' };
  if (!header) return { valid: false, reason: 'missing-signature' };

  const parts: Record<string, string> = {};
  for (const segment of header.split(',')) {
    const idx = segment.indexOf('=');
    if (idx === -1) continue;
    const k = segment.slice(0, idx).trim();
    const v = segment.slice(idx + 1).trim();
    if (k && v) parts[k] = v;
  }
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return { valid: false, reason: 'malformed' };

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - t) > STRIPE_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'expired' };
  }

  const signedPayload = `${t}.${payload}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');
  if (!constantTimeEqualHex(expected, v1)) {
    return { valid: false, reason: 'signature-mismatch' };
  }
  return { valid: true };
}

/**
 * Iyzico-style signature verification (SHA-1 base64).
 *
 * NOT: Iyzico zaman içinde imza şemasını değiştirmiş olabilir. Bu fonksiyonu
 * canlıya almadan önce sağlayıcının güncel dokümanını teyit et — bazı versiyonlar
 * payload+apiKey+secret konkatenasyonunu farklı sırayla yapıyor.
 *
 * @param payload      Raw request body string.
 * @param headerHash   X-Iyz-Signature-V2 veya benzeri header değeri.
 * @param apiKey       Iyzico API key.
 * @param secret       Iyzico secret.
 */
export function verifyIyzicoSignature(
  payload: string,
  headerHash: string | undefined,
  apiKey: string | undefined,
  secret: string | undefined,
): VerifyResult {
  if (!apiKey || !secret) return { valid: false, reason: 'missing-secret' };
  if (!headerHash) return { valid: false, reason: 'missing-signature' };

  const expected = createHash('sha1')
    .update(apiKey + payload + secret, 'utf8')
    .digest('base64');

  if (!constantTimeEqualBase64(expected, headerHash)) {
    return { valid: false, reason: 'signature-mismatch' };
  }
  return { valid: true };
}

/** Hex string'leri eşit uzunlukta + timing-safe karşılaştır. */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/** Base64 string'leri eşit uzunlukta + timing-safe karşılaştır. */
function constantTimeEqualBase64(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'base64'), Buffer.from(b, 'base64'));
  } catch {
    return false;
  }
}
