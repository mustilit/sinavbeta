/**
 * Encryption utils (AES-256-GCM) round-trip testleri.
 */

// EMAIL_SECRETS_KEY: 32 byte = 64 hex karakter
process.env.EMAIL_SECRETS_KEY = 'a'.repeat(64);

import {
  encryptSecret,
  decryptSecret,
  encryptJson,
  decryptJson,
  maskSecret,
} from '../../src/application/services/email/utils/encryption';

describe('Encryption utils (AES-256-GCM)', () => {
  // --- Round-trip ---

  describe('encryptSecret / decryptSecret', () => {
    it('şifrele → çöz → orijinal metni döner', () => {
      const plaintext = 'my-super-secret-api-key';
      const encrypted = encryptSecret(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(decryptSecret(encrypted)).toBe(plaintext);
    });

    it('aynı metni iki kez şifreleme farklı cipher üretir (IV randomness)', () => {
      const plaintext = 'test-secret';
      const enc1 = encryptSecret(plaintext);
      const enc2 = encryptSecret(plaintext);
      // Farklı IV'ler nedeniyle cipher'lar farklı olmalı
      expect(enc1).not.toBe(enc2);
    });

    it('bozuk payload çözülmeye çalışıldığında hata fırlatır', () => {
      expect(() => decryptSecret('invaliddataXXXX==')).toThrow();
    });

    it('çok kısa payload (< IV+authTag) hata fırlatır', () => {
      const short = Buffer.from('short').toString('base64');
      expect(() => decryptSecret(short)).toThrow('Encrypted payload too short');
    });
  });

  // --- JSON round-trip ---

  describe('encryptJson / decryptJson', () => {
    it('JSON nesnesi şifrelenip geri alınır', () => {
      const data = { apiKey: 'brevo-key-xyz', extra: 42 };
      const encrypted = encryptJson(data);
      const decrypted = decryptJson<typeof data>(encrypted);
      expect(decrypted.apiKey).toBe('brevo-key-xyz');
      expect(decrypted.extra).toBe(42);
    });
  });

  // --- maskSecret ---

  describe('maskSecret', () => {
    it('null veya undefined için boş string döner', () => {
      expect(maskSecret(null)).toBe('');
      expect(maskSecret(undefined)).toBe('');
    });

    it('kısa değer (4 karakter veya az) sadece ••• döner', () => {
      expect(maskSecret('abc')).toBe('••••');
    });

    it('uzun değer baş 2 ve son 2 karakteri gösterir', () => {
      const result = maskSecret('abcdefgh');
      expect(result).toBe('ab••••gh');
    });
  });

  // --- Yanlış key ---

  describe('yanlış key', () => {
    it('yanlış key ile deşifrelenemez', () => {
      const original = 'secret';
      const encrypted = encryptSecret(original);

      // Key'i değiştir
      process.env.EMAIL_SECRETS_KEY = 'b'.repeat(64);
      expect(() => decryptSecret(encrypted)).toThrow();

      // Orijinal key'e dön
      process.env.EMAIL_SECRETS_KEY = 'a'.repeat(64);
    });
  });
});
