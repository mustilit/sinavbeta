import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { UserPublic } from '../../../domain/entities/User';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { JwtService } from '../../../infrastructure/services/JwtService';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { prisma } from '../../../infrastructure/database/prisma';
import { RedisCache } from '../../../infrastructure/cache/RedisCache';
import { AuditLogger, AuditContext } from '../../../infrastructure/audit/AuditLogger';
import { NotifyNewDeviceLoginUseCase } from './NotifyNewDeviceLoginUseCase';
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
    private readonly jwtService: JwtService,
    /**
     * Audit log için opsiyonel — DI verilirse AUTH_LOGIN_SUCCESS / AUTH_LOGIN_FAIL
     * yazılır. Verilmezse fallback olarak yapılandırılmış logger'a yazılır.
     * Geriye dönük uyumluluk için opsiyonel bırakıldı.
     */
    private readonly audit?: AuditLogger,
    /**
     * Yeni cihazdan giriş tespiti + uyarı maili. Opsiyonel — yoksa cihaz takibi devre dışı.
     */
    private readonly notifyDevice?: NotifyNewDeviceLoginUseCase,
  ) {}

  /**
   * E-posta ve şifreyi doğrulayarak JWT token döner — VEYA 2FA aktifse pendingMfaToken.
   * @param dto.email    - Kullanıcının e-posta adresi (boşluklar temizlenir, küçük harfe dönüştürülür).
   * @param dto.password - Kullanıcının şifresi (düz metin).
   * @param ctx          - Audit/log context (ip, userAgent, requestId). Opsiyonel.
   * @throws {Error} INVALID_CREDENTIALS — e-posta/şifre boş, kullanıcı bulunamadı veya şifre yanlış.
   * @throws {Error} ACCOUNT_SUSPENDED — askıya alınmış hesap.
   */
  async execute(
    dto: { email: string; password: string },
    ctx?: AuditContext,
  ): Promise<LoginExecuteResult> {
    // Girdi normalize edilir. Tanımlayıcı e-posta VEYA kullanıcı adı olabilir:
    // E-Sınıf (okul) kullanıcıları e-posta yerine kullanıcı adıyla giriş yapar
    // (örn. ANK-A-0001). "@" içeriyorsa e-posta, içermiyorsa kullanıcı adı sayılır.
    const identifier = dto?.email ? String(dto.email).trim() : '';
    const password = dto?.password != null ? String(dto.password) : '';
    if (!identifier || !password) {
      this.logLoginFail(ctx, undefined, identifier, 'missing_credentials');
      throw new Error('INVALID_CREDENTIALS');
    }

    const isEmail = identifier.includes('@');
    const email = isEmail ? identifier.toLowerCase() : identifier;
    const user = isEmail
      ? await this.userRepository.findByEmail(email)
      : await this.userRepository.findByUsername(identifier);
    // Kullanıcı bulunamasa da aynı hata fırlatılır — numaralandırmayı önler
    if (!user) {
      this.logLoginFail(ctx, undefined, identifier, 'user_not_found');
      throw new Error('INVALID_CREDENTIALS');
    }

    const isValid = await this.passwordService.compare(password, user.passwordHash);

    if (!isValid) {
      this.logLoginFail(ctx, user.id, email, 'invalid_password');
      throw new Error('INVALID_CREDENTIALS');
    }

    // Askıya alınmış hesap — şifre doğru olsa bile giriş engellenir
    if (user.status === 'SUSPENDED') {
      this.logLoginFail(ctx, user.id, email, 'account_suspended');
      throw new Error('ACCOUNT_SUSPENDED');
    }

    // ── Cihaz güvenliği ─────────────────────────────────────────────────────
    // ADMIN/WORKER: güvenilmeyen (yeni veya henüz onaylanmamış) cihazdan giriş, cihaz
    // e-posta linkiyle onaylanana dek ENGELLENİR. CANDIDATE/EDUCATOR: yalnızca yeni cihaz
    // uyarı maili gönderilir, giriş serbest. Bu blok 2FA dalından ÖNCE çalışır → 2FA açık
    // olsa bile admin önce cihazı onaylamadan pendingMfaToken dahi alamaz.
    if (this.notifyDevice) {
      // ADMIN/WORKER her zaman; E-Sınıf Okul Yöneticisi (SchoolUser.schoolRole
      // === 'SCHOOL_ADMIN') de yeni/bilinmeyen cihazda e-posta ile onay vermeden
      // içeri alınmaz. Okul yöneticisi gerçek e-postasıyla atanır → doğrulama maili ulaşır.
      let requireTrust = user.role === 'ADMIN' || user.role === 'WORKER';
      if (!requireTrust) {
        try {
          const sa = await prisma.schoolUser.findFirst({
            where: { userId: user.id, schoolRole: 'SCHOOL_ADMIN' as any, isActive: true },
            select: { id: true },
          });
          requireTrust = !!sa;
        } catch {
          // fail-soft: okul rolü çözülemezse cihaz kapısını zorlamayız (login DB zaten çalıştı)
          requireTrust = false;
        }
      }
      let device: { requiresVerification: boolean } | undefined;
      try {
        device = await this.notifyDevice.execute({
          userId: user.id,
          userEmail: user.email,
          username: user.username,
          userRole: user.role as 'CANDIDATE' | 'EDUCATOR' | 'ADMIN' | 'WORKER',
          userAgent: ctx?.userAgent,
          ip: ctx?.ip,
          requireTrust,
        });
      } catch {
        // Değerlendirme hatası → fail-soft (login DB zaten çalıştı). Admin'i geçici
        // hatada kilitlememek için bloklamayız.
        device = undefined;
      }
      if (requireTrust && device?.requiresVerification) {
        this.logLoginFail(ctx, user.id, email, 'device_verification_required');
        throw new Error('DEVICE_VERIFICATION_REQUIRED');
      }
    }

    // 2FA gate — önce sistem geneli flag kontrol edilir (admin kapatmışsa bypass)
    // $queryRaw: Prisma client sürümünden bağımsız çalışır; yeni alanlar için generate gerekmez
    const adminRows = await prisma.$queryRaw`
      SELECT "twoFactorSystemEnabled" FROM admin_settings WHERE id = 1 LIMIT 1
    ` as Array<{ twoFactorSystemEnabled: boolean }>;
    const systemTfaEnabled = adminRows[0]?.twoFactorSystemEnabled ?? false;

    if (systemTfaEnabled) {
      // Kullanıcının bireysel 2FA ayarını oku
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
        this.logLoginSuccess(ctx, user.id, email, { mfaPending: true });
        return { requiresMfa: true, pendingMfaToken };
      }
    }

    // 2FA kapalı → normal akış. Tek aktif oturum kuralı için yeni sessionId
    // üretilir ve User.activeSessionId'ye yazılır; eski cihazların token'ları
    // bu noktada otomatik geçersizleşir (JwtAuthGuard sid karşılaştırması).
    //
    // RAW SQL: Prisma client REJECTED enum'unu görmediği için (Windows EPERM)
    // status select etmesek bile `prisma.user.update` row hydrate edip patlar.
    // `$executeRaw` enum'a dokunmuyor → güvenli.
    const sid = randomUUID();
    await prisma.$executeRaw`
      UPDATE users SET "activeSessionId" = ${sid}, "updatedAt" = NOW()
      WHERE id = ${user.id}
    `;

    // Cache'i hemen invalidate et — JwtAuthGuard 60s TTL bekleyip eski
    // session ID ile kabul etmesin. Best-effort.
    try {
      const cache = new RedisCache();
      await cache.del(`userBanStatus:${user.id}`);
    } catch {
      /* sessiz */
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      sid,
    });

    this.logLoginSuccess(ctx, user.id, email);

    // (Cihaz tespiti/bildirim ve admin/worker doğrulama kapısı yukarıda — 2FA dalından
    //  ÖNCE — çalıştırıldı; burada tekrar çağrılmaz.)

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

  /** Başarılı giriş için audit + log. Audit yoksa logger'a düşer. */
  private logLoginSuccess(
    ctx: AuditContext | undefined,
    userId: string,
    email: string,
    extra?: Record<string, unknown>,
  ): void {
    if (this.audit) {
      this.audit.logAsync(ctx ?? {}, {
        action: 'AUTH_LOGIN_SUCCESS' as any,
        entityType: 'User',
        entityId: userId,
        metadata: { email, ...(extra ?? {}) },
      });
    } else {
      // eslint-disable-next-line no-console
      console.info('[auth.login.success]', { userId, email, ...(extra ?? {}) });
    }
  }

  /** Başarısız giriş denemesi için audit + log. */
  private logLoginFail(
    ctx: AuditContext | undefined,
    userId: string | undefined,
    email: string,
    reason: string,
  ): void {
    if (this.audit) {
      this.audit.logAsync(ctx ?? {}, {
        action: 'AUTH_LOGIN_FAIL' as any,
        entityType: 'User',
        entityId: userId ?? 'unknown',
        metadata: { email, reason },
      });
    } else {
      // eslint-disable-next-line no-console
      console.warn('[auth.login.fail]', { userId, email, reason });
    }
  }
}
