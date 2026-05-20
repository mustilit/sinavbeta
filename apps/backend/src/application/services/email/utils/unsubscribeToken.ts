import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

function getSigningKey(): Buffer {
  const hex = process.env.EMAIL_SECRETS_KEY;
  if (!hex) {
    throw new Error('EMAIL_SECRETS_KEY missing — required for unsubscribe token signing');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Kullanıcıya özel kalıcı unsubscribe token üretir.
 * Format: <random32>.<hmac> — DB'de saklanır, mail footer link'inde gönderilir.
 */
export function generateUnsubscribeToken(): string {
  const raw = randomBytes(32).toString('base64url');
  const sig = createHmac('sha256', getSigningKey()).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

/**
 * Token formatı + imza doğrulaması. DB lookup'tan ÖNCE çağrılmalı.
 */
export function isWellFormedUnsubscribeToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [raw, sig] = parts;
  if (!raw || !sig) return false;
  try {
    const expected = createHmac('sha256', getSigningKey()).update(raw).digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
