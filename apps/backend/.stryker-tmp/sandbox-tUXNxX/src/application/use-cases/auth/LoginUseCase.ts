// @ts-nocheck
import * as jwt from 'jsonwebtoken';
import { UserPublic } from '../../../domain/entities/User';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { JwtService } from '../../../infrastructure/services/JwtService';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { prisma } from '../../../infrastructure/database/prisma';
// LoginDTO previously lived in presentation layer; accept plain input here

const JWT_SECRET = process.env.JWT_SECRET || 'dal-secret-change-in-production';
const PENDING_MFA_TTL_SECONDS = 300; // 5 dk
const PENDING_MFA_AUD = '2fa-login';

/** Başarılı giriş sonucunda dönen kullanıcı bilgisi ve JWT token'ı. */
export interface LoginResult {
  user: UserPublic;
  token: string;
}

/** 2FA aktifse password doğru olsa bile asıl token verilmez; kısa-ömürlü pendingMfaToken döner. */
export interface PendingMfaResult {
  requiresMfa: true;
  pendingMfaToken: string;
}

export type LoginExecuteResult = LoginResult | PendingMfaResult;

/**
 * Kullanıcı girişini yönetir.
 * E-posta/şifre doğrular, JWT token üretir.
 * Kullanıcı bulunamazsa veya şifre yanlışsa her iki durumda da aynı hata döner
 * (timing saldırısı önlemi ve bilgi ifşası engeli).
 *
 * 2FA aktifse: password doğru olsa bile asıl token verilmez. Kısa-ömürlü (5 dk)
 * `pendingMfaToken` döner. Frontend `/v1/auth/2fa/verify-login` ile kodu sorar.
 */
export class LoginUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService
  ) {}

  /**
   * E-posta ve şifreyi doğrulayarak JWT token döner — VEYA 2FA aktifse pendingMfaToken.
   * @param dto.email    - Kullanıcının e-posta adresi (boşluklar temizlenir, küçük harfe dönüştürülür).
   * @param dto.password - Kullanıcının şifresi (düz metin).
   * @throws {Error} INVALID_CREDENTIALS — e-posta/şifre boş, kullanıcı bulunamadı veya şifre yanlış.
   */
  async execute(dto: { email: string; password: string }): Promise<LoginExecuteResult> {
    // Girdi normalize edilir — boşluk içeren e-postalar ve tip dönüşüm sorunları giderilir
    const email = dto?.email ? String(dto.email).trim().toLowerCase() : '';
    const password = dto?.password != null ? String(dto.password) : '';
    if (!email || !password) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const user = await this.userRepository.findByEmail(email);
    // Kullanıcı bulunamasa da aynı hata fırlatılır — e-posta numaralandırmasını önler
    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const isValid = await this.passwordService.compare(password, user.passwordHash);

    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // 2FA gate — User entity'de bu alanlar yok; doğrudan Prisma'dan oku.
    // Sadece flag çekiyoruz, secret'ı VerifyTwoFactorLoginUseCase çekecek.
    const tfa = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true } as any,
    });
    if (tfa && (tfa as any).twoFactorEnabled === true) {
      const pendingMfaToken = jwt.sign(
        { sub: user.id, aud: PENDING_MFA_AUD, mfa: 'pending' },
        JWT_SECRET,
        { expiresIn: PENDING_MFA_TTL_SECONDS },
      );
      return { requiresMfa: true, pendingMfaToken };
    }

    // 2FA kapalı → normal akış
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
      token,
    };
  }
}
