/**
 * verifyWebhookSignature genişletilmiş testleri.
 * Mevcut dosyanın üstüne eklenmez — ayrı dosya olarak ek senaryoları kapsar.
 */
import { createHmac, createHash } from 'crypto';
import {
  verifyStripeSignature,
  verifyIyzicoSignature,
} from '../../src/nest/security/verifyWebhookSignature';

const STRIPE_SECRET = 'whsec_test_secret_32chars_padding_';

function buildStripeHeader(payload: string, secret: string, t?: number): string {
  const timestamp = t ?? Math.floor(Date.now() / 1000);
  const signed = `${timestamp}.${payload}`;
  const sig = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

describe('verifyStripeSignature (genişletilmiş)', () => {
  // --- Missing inputs ---

  describe('eksik parametreler', () => {
    it('secret yoksa missing-secret döner', () => {
      const result = verifyStripeSignature('payload', 't=1,v1=abc', undefined);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing-secret');
    });

    it('header yoksa missing-signature döner', () => {
      const result = verifyStripeSignature('payload', undefined, STRIPE_SECRET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing-signature');
    });
  });

  // --- Malformed header ---

  describe('bozuk header', () => {
    it('timestamp veya v1 olmayan header malformed döner', () => {
      const result = verifyStripeSignature('payload', 'no-valid-segments', STRIPE_SECRET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('malformed');
    });

    it('timestamp NaN ise malformed döner', () => {
      const result = verifyStripeSignature('payload', 't=notanumber,v1=abc', STRIPE_SECRET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('malformed');
    });
  });

  // --- Replay protection (expired) ---

  describe('replay koruması', () => {
    it('6 dakika gecikmeli imza expired döner', () => {
      const old = Math.floor(Date.now() / 1000) - 6 * 60;
      const header = buildStripeHeader('payload', STRIPE_SECRET, old);
      const result = verifyStripeSignature('payload', header, STRIPE_SECRET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('4 dakika gecikmeli imza geçerlidir', () => {
      const recent = Math.floor(Date.now() / 1000) - 4 * 60;
      const header = buildStripeHeader('payload-body', STRIPE_SECRET, recent);
      const result = verifyStripeSignature('payload-body', header, STRIPE_SECRET);
      expect(result.valid).toBe(true);
    });
  });

  // --- Signature mismatch ---

  describe('imza uyuşmazlığı', () => {
    it('yanlış secret ile imza mismatch döner', () => {
      const header = buildStripeHeader('payload', 'wrong_secret_padding_here__pad__');
      const result = verifyStripeSignature('payload', header, STRIPE_SECRET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('signature-mismatch');
    });

    it('payload değiştirilmişse mismatch döner', () => {
      const header = buildStripeHeader('original-payload', STRIPE_SECRET);
      const result = verifyStripeSignature('tampered-payload', header, STRIPE_SECRET);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('signature-mismatch');
    });
  });

  // --- Başarı ---

  describe('geçerli imza', () => {
    it('doğru payload ve header ile valid:true döner', () => {
      const payload = JSON.stringify({ type: 'checkout.session.completed', id: 'evt_1' });
      const header = buildStripeHeader(payload, STRIPE_SECRET);
      const result = verifyStripeSignature(payload, header, STRIPE_SECRET);
      expect(result.valid).toBe(true);
    });
  });
});

describe('verifyIyzicoSignature (genişletilmiş)', () => {
  const apiKey = 'iyzico-api-key';
  const secret = 'iyzico-secret-key';

  function buildIyzicoHash(payload: string): string {
    return createHash('sha1')
      .update(apiKey + payload + secret, 'utf8')
      .digest('base64');
  }

  describe('eksik parametreler', () => {
    it('apiKey yoksa missing-secret döner', () => {
      const result = verifyIyzicoSignature('payload', 'hash', undefined, secret);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing-secret');
    });

    it('secret yoksa missing-secret döner', () => {
      const result = verifyIyzicoSignature('payload', 'hash', apiKey, undefined);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing-secret');
    });

    it('headerHash yoksa missing-signature döner', () => {
      const result = verifyIyzicoSignature('payload', undefined, apiKey, secret);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing-signature');
    });
  });

  describe('imza doğrulama', () => {
    it('doğru hash ile valid:true döner', () => {
      const payload = JSON.stringify({ status: 'success' });
      const hash = buildIyzicoHash(payload);
      const result = verifyIyzicoSignature(payload, hash, apiKey, secret);
      expect(result.valid).toBe(true);
    });

    it('yanlış hash ile signature-mismatch döner', () => {
      const result = verifyIyzicoSignature('payload', 'wronghash==', apiKey, secret);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('signature-mismatch');
    });

    it('payload değiştirilmişse mismatch döner', () => {
      const original = 'original-body';
      const hash = buildIyzicoHash(original);
      const result = verifyIyzicoSignature('tampered-body', hash, apiKey, secret);
      expect(result.valid).toBe(false);
    });
  });
});
