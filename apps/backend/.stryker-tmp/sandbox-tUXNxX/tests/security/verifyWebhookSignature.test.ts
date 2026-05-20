/**
 * verifyWebhookSignature unit testleri.
 *
 * Kapsam:
 *   - Stripe HMAC-SHA256 imza doğrulama (mutlu yol)
 *   - Eksik / bozuk header senaryoları
 *   - Timestamp tolerans (5 dk dışı → expired)
 *   - Tek karakter farkı → signature-mismatch
 *   - Iyzico SHA-1 base64 imza
 *
 * Skill: docs/proposed-claude/skills/idempotency/SKILL.md
 */
// @ts-nocheck

import { createHmac, createHash } from 'crypto';
import {
  verifyStripeSignature,
  verifyIyzicoSignature,
} from '../../src/nest/security/verifyWebhookSignature';

function buildStripeHeader(payload: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const signed = `${t}.${payload}`;
  const v1 = createHmac('sha256', secret).update(signed).digest('hex');
  return { header: `t=${t},v1=${v1}`, t, v1 };
}

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_secret_1234567890';
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });

  it('geçerli imzayı kabul eder', () => {
    const { header } = buildStripeHeader(payload, secret);
    const result = verifyStripeSignature(payload, header, secret);
    expect(result.valid).toBe(true);
  });

  it('eksik header → missing-signature', () => {
    const result = verifyStripeSignature(payload, undefined, secret);
    expect(result).toEqual({ valid: false, reason: 'missing-signature' });
  });

  it('eksik secret → missing-secret', () => {
    const { header } = buildStripeHeader(payload, secret);
    const result = verifyStripeSignature(payload, header, undefined);
    expect(result).toEqual({ valid: false, reason: 'missing-secret' });
  });

  it('bozuk header (t/v1 yok) → malformed', () => {
    const result = verifyStripeSignature(payload, 'not-a-real-header', secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('malformed');
  });

  it('5 dk üzeri timestamp → expired', () => {
    const oldT = Math.floor(Date.now() / 1000) - 600; // 10 dk önce
    const { header } = buildStripeHeader(payload, secret, oldT);
    const result = verifyStripeSignature(payload, header, secret);
    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  it('imza tek karakter farkı → signature-mismatch', () => {
    const { header, t, v1 } = buildStripeHeader(payload, secret);
    // v1'in son karakterini bozalım
    const last = v1.slice(-1);
    const tampered = v1.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    const result = verifyStripeSignature(payload, `t=${t},v1=${tampered}`, secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature-mismatch');
  });

  it('payload değişirse → signature-mismatch', () => {
    const { header } = buildStripeHeader(payload, secret);
    const tamperedPayload = payload.replace('succeeded', 'failed');
    const result = verifyStripeSignature(tamperedPayload, header, secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature-mismatch');
  });

  it('yanlış secret → signature-mismatch', () => {
    const { header } = buildStripeHeader(payload, secret);
    const result = verifyStripeSignature(payload, header, 'wrong-secret');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature-mismatch');
  });
});

describe('verifyIyzicoSignature', () => {
  const apiKey = 'sandbox-iyzico-api-key';
  const secret = 'sandbox-iyzico-secret';
  const payload = JSON.stringify({ status: 'success', paymentId: '123' });

  function makeHeader() {
    return createHash('sha1').update(apiKey + payload + secret, 'utf8').digest('base64');
  }

  it('geçerli imzayı kabul eder', () => {
    const header = makeHeader();
    const result = verifyIyzicoSignature(payload, header, apiKey, secret);
    expect(result.valid).toBe(true);
  });

  it('eksik header → missing-signature', () => {
    const result = verifyIyzicoSignature(payload, undefined, apiKey, secret);
    expect(result).toEqual({ valid: false, reason: 'missing-signature' });
  });

  it('eksik apiKey veya secret → missing-secret', () => {
    expect(verifyIyzicoSignature(payload, 'x', undefined, secret)).toEqual({
      valid: false,
      reason: 'missing-secret',
    });
    expect(verifyIyzicoSignature(payload, 'x', apiKey, undefined)).toEqual({
      valid: false,
      reason: 'missing-secret',
    });
  });

  it('payload değişirse → signature-mismatch', () => {
    const header = makeHeader();
    const result = verifyIyzicoSignature(payload + ' tampered', header, apiKey, secret);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature-mismatch');
  });
});
