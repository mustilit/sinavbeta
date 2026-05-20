import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.EMAIL_SECRETS_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'EMAIL_SECRETS_KEY missing or invalid — 64 hex characters (32 bytes) required',
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * AES-256-GCM ile düz metin şifreler.
 * Çıktı: base64(iv || ciphertext || authTag)
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

/**
 * encryptSecret çıktısını çözer. Yanlış key veya bozuk veride hata fırlatır.
 */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted payload too short');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ct = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/**
 * JSON nesneyi şifreler. Provider secrets için pratik.
 */
export function encryptJson(value: Record<string, unknown>): string {
  return encryptSecret(JSON.stringify(value));
}

/**
 * Şifrelenmiş JSON'u çözer. Yanlış key/format → hata.
 */
export function decryptJson<T = Record<string, unknown>>(payload: string): T {
  return JSON.parse(decryptSecret(payload)) as T;
}

/**
 * Şifre alanlarını UI'ya dönerken mask'lemek için.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return value.slice(0, 2) + '••••' + value.slice(-2);
}
