/**
 * TwoFactorService — TOTP (RFC 6238) tabanlı 2FA.
 *
 * Bağımlılıklar (aktif):
 *   otplib       — TOTP secret üretme/doğrulama
 *   qrcode       — QR PNG (data URL) üretme
 *   bcryptjs     — recovery code hashleme/karşılaştırma
 *
 * Kullanım:
 *   const svc = new TwoFactorService();
 *   const { secret, otpauthUrl, qrPng } = await svc.setup(user.email);
 *   // ... user secret'ı doğrular ...
 *   const ok = svc.verify(secret, userInputCode);
 *
 * `secret` veritabanına yazılmadan ÖNCE encryption helper'ı ile şifrelenmelidir
 * (`apps/backend/src/infrastructure/security/encryption.ts`).
 *
 * İlgili skill: docs/proposed-claude/skills/security-hardening/SKILL.md
 */
// @ts-nocheck

import { randomBytes } from 'crypto';
import { generateSecret, generateURI, verify as otpVerify } from 'otplib';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcryptjs';

const ISSUER = 'Sinav Salonu';
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 8; // 16 hex char
const BCRYPT_ROUNDS = 10;
// Clock skew toleransı: ±30s — verify çağrısında epochTolerance ile geçilir.
const EPOCH_TOLERANCE = 30;

export interface TwoFactorSetup {
  /** Plain TOTP secret (Base32). Encrypt + DB'ye yaz. */
  secret: string;
  /** Authenticator URI — QR olarak göster. */
  otpauthUrl: string;
  /** QR code PNG (data URL). */
  qrPng: string;
  /** Hashed recovery code'lar — DB'ye yaz. */
  recoveryHashed: string[];
  /** Plain recovery code'lar — TEK SEFER kullanıcıya göster. */
  recoveryPlain: string[];
}

/**
 * Setup için:
 *   1. Secret üret
 *   2. otpauth URL hazırla
 *   3. QR PNG üret (data URL)
 *   4. 10 recovery code üret, bcrypt'le
 */
export class TwoFactorService {
  async setup(email: string): Promise<TwoFactorSetup> {
    const secret = generateSecret({});
    const otpauthUrl = generateURI({ label: email, issuer: ISSUER, secret });
    const qrPng = await QRCode.toDataURL(otpauthUrl);

    const recoveryPlain = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomBytes(RECOVERY_CODE_BYTES).toString('hex'),
    );
    const recoveryHashed = await Promise.all(
      recoveryPlain.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)),
    );

    return { secret, otpauthUrl, qrPng, recoveryHashed, recoveryPlain };
  }

  /**
   * Kullanıcının girdiği 6 haneli TOTP kodunu doğrular.
   * `authenticator.options.window = 1` ile ±30s clock skew tolere edilir.
   */
  async verify(secret: string, token: string): Promise<boolean> {
    if (!secret || !token) return false;
    try {
      const result = await otpVerify({ token: String(token).trim(), secret, epochTolerance: EPOCH_TOLERANCE });
      return result.valid;
    } catch {
      return false;
    }
  }

  /**
   * Recovery code kullanım denemesi. Hashedlanmış code'lar listesini eşleştirir,
   * eşleşen indeks varsa code'u listeden DÜŞÜRÜR (one-time-use), yeni listeyi döner.
   * Eşleşme yoksa `{ ok: false }`.
   */
  async consumeRecoveryCode(
    hashedList: string[],
    plain: string,
  ): Promise<{ ok: boolean; remaining?: string[] }> {
    if (!plain || !Array.isArray(hashedList) || hashedList.length === 0) {
      return { ok: false };
    }
    const candidate = String(plain).trim();
    for (let i = 0; i < hashedList.length; i++) {
      try {
        if (await bcrypt.compare(candidate, hashedList[i])) {
          const remaining = hashedList.filter((_, idx) => idx !== i);
          return { ok: true, remaining };
        }
      } catch {
        // bozuk hash → sıradakine geç
        continue;
      }
    }
    return { ok: false };
  }
}
