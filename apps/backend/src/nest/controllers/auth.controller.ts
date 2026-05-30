import { Controller, Post, Body, Get, Req, HttpException, HttpStatus, UseGuards, HttpCode, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RegisterUseCase } from '../../application/use-cases/auth/RegisterUseCase';
import { RegisterEducatorUseCase } from '../../application/use-cases/auth/RegisterEducatorUseCase';
import { LoginUseCase } from '../../application/use-cases/auth/LoginUseCase';
import { GoogleAuthUseCase } from '../../application/use-cases/auth/GoogleAuthUseCase';
import { ForgotPasswordUseCase } from '../../application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../../application/use-cases/auth/ResetPasswordUseCase';
import { VerifyDeviceUseCase } from '../../application/use-cases/auth/VerifyDeviceUseCase';
import { SendEmailVerificationUseCase } from '../../application/use-cases/auth/SendEmailVerificationUseCase';
import { VerifyEmailUseCase } from '../../application/use-cases/auth/VerifyEmailUseCase';
import { Public } from '../decorators/public.decorator';
import { RequireCaptcha } from '../decorators/require-captcha.decorator';
import { RegisterEducatorDto } from './dto/register-educator.dto';
import { IUserRepository } from '../../domain/interfaces/IUserRepository';
import { USER_REPO } from '../../application/constants';
import { Inject } from '@nestjs/common';
import { PrismaUserRepository } from '../../infrastructure/repositories/PrismaUserRepository';
import { PasswordService } from '../../infrastructure/services/PasswordService';
import { JwtService } from '../../infrastructure/services/JwtService';
import { LoginBruteforceGuard } from '../guards/login-bruteforce.guard';
import { delKey } from '../common/rate-limit';
import { prisma } from '../../infrastructure/database/prisma';
import { auditContextFromRequest } from '../../infrastructure/audit/AuditLogger';

/**
 * Kimlik doğrulama işlemlerini yönetir: kayıt, giriş, şifre sıfırlama ve oturum bilgisi.
 * Public endpoint'ler @Public() ile işaretlenmiştir — JWT guard bu endpoint'leri atlar.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly registerEducatorUseCase: RegisterEducatorUseCase,
    private readonly loginUseCase: LoginUseCase,
    @Inject(USER_REPO) private readonly userRepo: IUserRepository,
    @Inject(ForgotPasswordUseCase) private readonly forgotPasswordUC: ForgotPasswordUseCase,
    @Inject(ResetPasswordUseCase) private readonly resetPasswordUC: ResetPasswordUseCase,
    @Inject(GoogleAuthUseCase) private readonly googleAuthUC: GoogleAuthUseCase,
    @Inject(VerifyDeviceUseCase) private readonly verifyDeviceUC: VerifyDeviceUseCase,
  ) {}

  /** Yeni cihazdan giriş mailindeki "Bu bendim" linki — cihazı trusted yapar */
  @Public()
  @Post('device/verify')
  @HttpCode(200)
  async verifyDevice(@Body() body: { token?: string }) {
    return this.verifyDeviceUC.execute({ token: body?.token ?? '' });
  }

  /** Google OAuth ID token ile giriş/kayıt — public endpoint */
  @Public()
  @Post('google')
  @HttpCode(200)
  async google(@Body() body: { idToken?: string; role?: 'CANDIDATE' | 'EDUCATOR' }) {
    if (!body?.idToken) {
      throw new HttpException({ error: 'idToken zorunludur', code: 'INVALID_INPUT' }, HttpStatus.BAD_REQUEST);
    }
    try {
      const result = await this.googleAuthUC.execute({ idToken: body.idToken, role: body.role });
      return result;
    } catch (err: any) {
      const status = err?.statusCode ?? err?.status ?? 401;
      throw new HttpException(
        { error: err?.message ?? 'Google ile giriş başarısız', code: err?.code ?? 'GOOGLE_AUTH_FAILED' },
        status,
      );
    }
  }

  /** Oturum açmış kullanıcının profil bilgilerini döndürür — JWT token'dan ID alınır */
  @Get('me')
  async me(@Req() req: any) {
    const sub = req.user?.sub;
    if (!sub) throw new HttpException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED);
    const user = await this.userRepo.findById(sub);
    if (!user) throw new HttpException({ error: 'User not found' }, HttpStatus.NOT_FOUND);

    const userResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      educatorApprovedAt: user.educatorApprovedAt ?? undefined,
      createdAt: user.createdAt,
    };

    // WORKER rolü ise sayfa izinlerini de ekle
    if (user.role === 'WORKER') {
      const wp = await prisma.workerPermission.findUnique({ where: { userId: user.id } });
      return { user: { ...userResponse, workerPages: wp?.pages ?? [] } };
    }

    return { user: userResponse };
  }

  /**
   * Email ve username uygunluk kontrolü — kayıt formunda sözleşme dialog'u açılmadan
   * ÖNCE çağrılır. Kullanıcı çakışan email/username ile sözleşmeleri okuyup onaylayıp
   * sonradan "zaten kayıtlı" hatasıyla karşılaşmasın diye. Public + throttled.
   * Boş string'ler kontrol edilmez (kısmi kontrole izin verir).
   */
  @Public()
  @Get('check-availability')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async checkAvailability(
    @Query('email') email?: string,
    @Query('username') username?: string,
  ) {
    const result = { emailAvailable: true, usernameAvailable: true };
    const e = (email || '').trim().toLowerCase();
    if (e) {
      const existing = await this.userRepo.findByEmail(e);
      if (existing) result.emailAvailable = false;
    }
    const u = (username || '').trim();
    if (u) {
      const existing = await this.userRepo.findByUsername(u);
      if (existing) result.usernameAvailable = false;
    }
    return result;
  }

  /** Yeni aday kaydı — kayıt sonrası email doğrulama linki gönderir (fire-and-forget) */
  @Post('register')
  @Public()
  @RequireCaptcha()
  async register(@Body() body: any, @Req() req: any) {
    try {
      // DI bazen dev ortamında undefined kalabiliyor (tsx watch + hot reload). Fail-safe:
      let uc = this.registerUseCase;
      if (!uc) {
        const { PrismaContractRepository } = require('../../infrastructure/repositories/PrismaContractRepository');
        const { PrismaContractAcceptanceRepository } = require('../../infrastructure/repositories/PrismaContractAcceptanceRepository');
        const { PrismaAuditLogRepository } = require('../../infrastructure/repositories/PrismaAuditLogRepository');
        const repo = new PrismaUserRepository();
        const pwd = new PasswordService();
        uc = new RegisterUseCase(
          repo,
          pwd,
          new PrismaContractRepository(prisma),
          new PrismaContractAcceptanceRepository(prisma),
          new PrismaAuditLogRepository(),
        );
      }
      // Sprint 14 — IP/UA delil olarak ContractAcceptance'a yazılır.
      const ip = (req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        || (req?.socket?.remoteAddress as string | undefined);
      const userAgent = req?.headers?.['user-agent'] as string | undefined;
      const user = await uc.execute(body, { ip, userAgent });

      // Email doğrulama linkini fire-and-forget gönder — kayıt akışını bekletmez/bozmaz
      try {
        const sendVerify = new SendEmailVerificationUseCase();
        await sendVerify.execute({ userId: user.id });
      } catch {
        // Email gönderim hatası kayıt akışını bozmaz — kullanıcı /auth/resend-verification ile yeniden isteyebilir
      }

      return user;
    } catch (err: any) {
      if (err.message === 'DUPLICATE_EMAIL') {
        throw new HttpException({ error: 'Bu e-posta adresi zaten kayıtlı.' }, HttpStatus.CONFLICT);
      }
      if (err.message === 'DUPLICATE_USERNAME') {
        throw new HttpException({ error: 'Bu kullanıcı adı zaten alınmış.' }, HttpStatus.CONFLICT);
      }
      // Beklenmedik hatayı stack trace ile logla — dev sırasında "Kayıt sırasında hata oluştu" body'si yeterli değil
      console.error('[register] unexpected error:', err?.message, err?.stack);
      throw new HttpException({ error: 'Kayıt sırasında hata oluştu' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Email doğrulama — token ile kullanıcının emailVerified bayrağını true yapar */
  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async verifyEmail(@Body() body: { token?: string }) {
    try {
      const uc = new VerifyEmailUseCase();
      const result = await uc.execute(String(body?.token ?? ''));
      return { ok: true, ...result };
    } catch (err: any) {
      const status = err?.status ?? HttpStatus.BAD_REQUEST;
      const code = err?.response?.code ?? err?.code ?? 'INVALID_TOKEN';
      const message = err?.response?.message ?? err?.message ?? 'Doğrulama başarısız';
      throw new HttpException({ error: message, code }, status);
    }
  }

  /**
   * Email doğrulama bağlantısını yeniden gönderir.
   * E-posta adresi kayıtlı değilse veya zaten doğrulanmışsa yine 200 döner —
   * kullanıcı numaralandırma saldırılarına karşı.
   */
  @Post('resend-verification')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  async resendVerification(@Body() body: { email?: string }) {
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new HttpException({ error: 'E-posta gerekli' }, HttpStatus.BAD_REQUEST);
    }

    const user: any = await (prisma as any).user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    // Kullanıcı yoksa veya zaten doğrulanmışsa sessizce 200 dön — bilgi sızdırma
    if (!user || user.emailVerified) {
      return { message: 'Eğer kayıtlıysa doğrulama bağlantısı gönderildi.' };
    }

    try {
      const sendVerify = new SendEmailVerificationUseCase();
      await sendVerify.execute({ userId: user.id });
    } catch {}

    return { message: 'Doğrulama bağlantısı yeniden gönderildi.' };
  }

  /**
   * Eğitici kaydı — sözleşme varlığı kontrol edilir; 30 istek/5 dakika throttle uygulanır.
   * firstName + lastName zorunlu. Kayıt sonrası email doğrulama linki gönderir.
   */
  @Post('register/educator')
  @Public()
  @RequireCaptcha()
  @Throttle({ default: { limit: 30, ttl: 300000 } })
  async registerEducator(
    @Body() body: RegisterEducatorDto & {
      firstName?: string;
      lastName?: string;
      acceptedEducatorContractId?: string;
      acceptedPrivacyContractId?: string;
    },
    @Req() req: any,
  ) {
    try {
      // DI bazen dev ortamında undefined kalabiliyor (tsx watch + hot reload). Fail-safe:
      let uc = this.registerEducatorUseCase;
      if (!uc) {
        const { PrismaContractRepository } = require('../../infrastructure/repositories/PrismaContractRepository');
        const { PrismaContractAcceptanceRepository } = require('../../infrastructure/repositories/PrismaContractAcceptanceRepository');
        const { PrismaAuditLogRepository } = require('../../infrastructure/repositories/PrismaAuditLogRepository');
        uc = new RegisterEducatorUseCase(
          new PrismaUserRepository(),
          new PrismaContractRepository(prisma),
          new PrismaContractAcceptanceRepository(prisma),
          new PrismaAuditLogRepository(),
          new PasswordService(),
          new JwtService(),
        );
      }
      // Sprint 14 — IP/UA delil için ContractAcceptance'a yazılır
      const ip = (req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        || (req?.socket?.remoteAddress as string | undefined);
      const userAgent = req?.headers?.['user-agent'] as string | undefined;
      const result = await uc.execute(
        {
          email: body.email,
          username: body.username,
          password: body.password,
          firstName: body.firstName ?? '',
          lastName: body.lastName ?? '',
          acceptedEducatorContractId: body.acceptedEducatorContractId,
          acceptedPrivacyContractId: body.acceptedPrivacyContractId,
        },
        { ip, userAgent },
      );

      // Email doğrulama linkini fire-and-forget gönder
      try {
        const sendVerify = new SendEmailVerificationUseCase();
        await sendVerify.execute({ userId: result.user.id });
      } catch {
        // Email gönderim hatası kayıt akışını bozmaz
      }

      return result;
    } catch (err: any) {
      if (err.code === 'CONTRACT_NOT_AVAILABLE') {
        throw new HttpException({ error: 'Eğitici sözleşmesi henüz tanımlanmamış.' }, HttpStatus.BAD_REQUEST);
      }
      // Yeni alan doğrulama hataları
      if (err.code === 'FIRSTNAME_REQUIRED' || err.code === 'FIRSTNAME_INVALID') {
        throw new HttpException({ error: err.message || 'Ad gereklidir', code: err.code }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'LASTNAME_REQUIRED' || err.code === 'LASTNAME_INVALID') {
        throw new HttpException({ error: err.message || 'Soyad gereklidir', code: err.code }, HttpStatus.BAD_REQUEST);
      }
      if (err.message === 'DUPLICATE_EMAIL') {
        throw new HttpException({ error: 'Bu e-posta adresi zaten kayıtlı.' }, HttpStatus.CONFLICT);
      }
      if (err.message === 'DUPLICATE_USERNAME') {
        throw new HttpException({ error: 'Bu kullanıcı adı zaten alınmış.' }, HttpStatus.CONFLICT);
      }
      console.error('[register/educator] unexpected error:', err?.message, err?.stack);
      throw new HttpException({ error: 'Kayıt sırasında hata oluştu' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Giriş — BruteforceGuard ile korunur; e-posta küçük harfe normalize edilir */
  @Post('login')
  @HttpCode(200)
  @Public()
  @RequireCaptcha()
  @UseGuards(LoginBruteforceGuard)
  async login(@Body() body: any, @Req() req: any) {
    const email = body?.email != null ? String(body.email).trim().toLowerCase() : '';
    const password = body?.password != null ? String(body.password) : '';
    if (!email || !password) {
      throw new HttpException(
        { error: 'E-posta ve şifre gerekli.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      // DI bazen dev ortamında undefined kalabiliyor (tsx watch + hot reload). Fail-safe:
      // Fallback'te de notifyDevice + audit dahil olur; aksi halde yeni cihaz uyarı maili tetiklenmez.
      let uc = this.loginUseCase;
      if (!uc) {
        const repo = new PrismaUserRepository();
        const pwd = new PasswordService();
        const jwt = new JwtService();
        // Lazy require — circular import'tan kaçınmak için
        const { SendEmailUseCase } = require('../../application/use-cases/email/SendEmailUseCase');
        const { NotifyNewDeviceLoginUseCase } = require('../../application/use-cases/auth/NotifyNewDeviceLoginUseCase');
        const notifyDevice = new NotifyNewDeviceLoginUseCase(new SendEmailUseCase());
        uc = new LoginUseCase(repo, pwd, jwt, undefined, notifyDevice);
      }
      // Audit context: ip + userAgent + (varsa) requestId — login akışında PII filtresi
      // use case içinde uygulanır.
      const ctx = auditContextFromRequest(req);
      const result = await uc.execute({ email, password }, ctx);
      // Başarılı giriş → brute-force sayaçlarını sıfırla (başarılı girişler bloke etmesin)
      const ip = (req.headers?.['x-forwarded-for']
        ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
        : req.ip || 'unknown');
      await Promise.allSettled([
        delKey(`login:ip:${ip}`),
        delKey(`login:email:${email}`),
      ]);
      return result;
    } catch (err: any) {
      if (err?.message === 'INVALID_CREDENTIALS') {
        throw new HttpException({ error: 'E-posta veya şifre hatalı.' }, HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(
        { error: err?.message || 'Giriş sırasında hata oluştu' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Şifre sıfırlama e-postası gönderir; kullanıcı bulunamasa da 200 döner (kullanıcı numaralandırmayı önler) */
  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  async forgotPassword(@Body() body: any) {
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!email) throw new HttpException({ error: 'E-posta gerekli' }, HttpStatus.BAD_REQUEST);
    await this.forgotPasswordUC.execute(email);
    return { message: 'E-posta gönderildi' }; // Always success
  }

  /** Token ile yeni şifre belirler; 10 istek/5 dakika throttle — brute-force token tahminine karşı */
  @Post('reset-password')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  async resetPassword(@Body() body: any) {
    const token = String(body?.token ?? '').trim();
    const newPassword = String(body?.newPassword ?? '');
    try {
      await this.resetPasswordUC.execute(token, newPassword);
      return { message: 'Sifre guncellendi' };
    } catch (err: any) {
      throw new HttpException({ error: err.message || 'Islem basarisiz' }, err.status ?? HttpStatus.BAD_REQUEST);
    }
  }
}
