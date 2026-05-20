/**
 * AES-256-GCM uygulama düzeyi şifreleme.
 *
 * 2FA secret, KVKK PII alanları, geri yüklenmesi gereken sensitive token'lar için.
 * AT-rest encryption ile birlikte defense-in-depth sağlar.
 *
 * Kullanım:
 *   const encrypted = encrypt(secret);   // "v1:base64(iv):base64(tag):base64(ciphertext)"
 *   const plain = decrypt(encrypted);
 *
 * Anahtar:
 *   APP_ENCRYPTION_KEY env değişkeninden 32 byte (hex veya base64).
 *   Üretme: openssl rand -hex 32   →   APP_ENCRYPTION_KEY=...
 *
 * Anahtar rotasyonu:
 *   Versiyon prefix'i ("v1:") ile gelecekte v2/v3 anahtar setine geçiş mümkün.
 *   Eski kayıtlar decrypt edilebilir; yeni yazımlar v2 ile.
 *
 * İlgili: security-hardening skill — secret management bölümü.
 */
// @ts-nocheck

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM 96-bit nonce
const VERSION = 'v1';

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'APP_ENCRYPTION_KEY env değişkeni eksik. 32 byte hex veya base64 üretip set edin: openssl rand -hex 32',
    );
  }
  // Hex (64 char) veya base64 desteği
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    key = Buffer.from(raw, 'base64');
  }
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY 32 byte olmalı, ${key.length} byte alındı.`,
    );
  }
  return key;
}

/**
 * Encrypt → `v1:base64(iv):base64(tag):base64(ciphertext)` formatı.
 */
export function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join(':');
}

/**
 * Decrypt — formatı `v1:base64(iv):base64(tag):base64(ciphertext)`.
 * Bozuk format veya yanlış anahtar → exception.
 */
export function decrypt(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Geçersiz şifreli payload formatı');
  }
  const [version, ivB64, tagB64, encB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Desteklenmeyen şifreleme versiyonu: ${version}`);
  }
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

/** Test/Stub yardımcı: encrypted gibi görünür ama içeriği plain. SADECE TEST için. */
export function isEncrypted(value: string): boolean {
  return /^v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}
