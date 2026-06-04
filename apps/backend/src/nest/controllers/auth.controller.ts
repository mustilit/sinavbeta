import { Controller, Post, Body, Get, Req, HttpException, HttpStatus, UseGuards, HttpCode, Query } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Throttle } from '@nestjs/throttler';
import { RegisterUseCase } from '../../application/use-cases/auth/RegisterUseCase';
import { RegisterEducatorUseCase } from '../../application/use-cases/auth/RegisterEducatorUseCase';
import { LoginUseCase } from '../../application/use-cases/auth/LoginUseCase';
import { GoogleAuthUseCase } from '../../application/use-cases/auth/GoogleAuthUseCase';
import { ForgotPasswordUseCase } from '../../application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../../application/use-cases/auth/ResetPasswordUseCase';
import { ChangePasswordUseCase } from '../../application/use-cases/auth/ChangePasswordUseCase';
import { ChangePasswordDto } from './dto/change-password.dto';
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
import { PrismaPendingRegistrationRepository } from '../../infrastructure/repositories/PrismaPendingRegistrationRepository';
import { PrismaContractRepository } from '../../infrastructure/repositories/PrismaContractRepository';
import { PrismaContractAcceptanceRepository } from '../../infrastructure/repositories/PrismaContractAcceptanceRepository';
import { PrismaAuditLogRepository } from '../../infrastructure/repositories/PrismaAuditLogRepository';

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
    @Inject(ChangePasswordUseCase) private readonly changePasswordUC: ChangePasswordUseCase,
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

    // Rejection + profil detayları — raw SQL: Prisma client REJECTED enum'unu
    // tanımıyor ve bazı yeni kolonlar (firstName/lastName/bio) için zaten raw
    // SQL'e geçiyoruz. Tek sorguda hepsini al.
    const detailRows = await prisma.$queryRaw<Array<{
      rejectionReason: string | null;
      rejectedAt: Date | null;
      firstName: string | null;
      lastName: string | null;
      bio: string | null;
      metadata: Record<string, unknown> | null;
    }>>`
      SELECT "rejectionReason", "rejectedAt", "firstName", "lastName", bio, metadata
      FROM users WHERE id = ${user.id} LIMIT 1
    `;
    const detail = detailRows[0] ?? null;
    const meta = (detail?.metadata ?? {}) as Record<string, any>;

    // Register wizard alanları: register endpoint metadata.cv_url, metadata.
    // specialized_exam_types, metadata.education_info, metadata.website_url,
    // metadata.linkedin_url yazıyor. Frontend (EducatorSettings, EducatorProfile)
    // user.cv_url / user.education / user.website / user.linkedin gibi top-level
    // alanlar bekliyor — burada metadata'yı tek sefer flatten + alias edelim.
    // (Aynı alanın hem snake hem camel kullanımı geriye dönük uyum sağlar.)
    const fullName = [detail?.firstName, detail?.lastName].filter(Boolean).join(' ') || user.username;

    const userResponse: any = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      educatorApprovedAt: user.educatorApprovedAt ?? undefined,
      rejectionReason: detail?.rejectionReason ?? null,
      rejectedAt: detail?.rejectedAt ?? null,
      // Geriye dönük uyumluluk — eski frontend alan adları (EducatorSettings rejection notice)
      educator_status:
        user.status === 'REJECTED' ? 'rejected'
        : user.status === 'ACTIVE' && user.educatorApprovedAt ? 'approved'
        : user.status === 'PENDING_EDUCATOR_APPROVAL' ? 'pending'
        : undefined,
      rejection_reason: detail?.rejectionReason ?? undefined,
      createdAt: user.createdAt,

      // Kimlik (register wizard step 1)
      firstName: detail?.firstName ?? null,
      lastName: detail?.lastName ?? null,
      full_name: fullName,

      // Profil (register wizard step 2 + EducatorSettings)
      bio: detail?.bio ?? meta.bio ?? '',
      cv_url: meta.cv_url ?? null,
      specialized_exam_types: Array.isArray(meta.specialized_exam_types) ? meta.specialized_exam_types : [],
      education: meta.education_info ?? meta.education ?? '',
      education_info: meta.education_info ?? '',
      website: meta.website_url ?? meta.website ?? '',
      website_url: meta.website_url ?? null,
      linkedin: meta.linkedin_url ?? meta.linkedin ?? '',
      linkedin_url: meta.linkedin_url ?? null,
      google_scholar_url: meta.google_scholar_url ?? '',
      profile_image_url: meta.profile_image_url ?? null,
      phone: meta.phone ?? '',
      city: meta.city ?? '',

      // Ödeme bilgileri (EducatorSettings payment tab)
      iban: meta.iban ?? '',
      bankName: meta.bankName ?? '',
      accountHolder: meta.accountHolder ?? '',

      // Bildirim tercihleri
      notification_preferences: meta.notification_preferences ?? null,

      // Ham metadata da dursun — yeni alan eklenirse frontend fallback yapabilir
      metadata: meta,
    };

    // WORKER rolü ise sayfa izinlerini de ekle
    if (user.role === 'WORKER') {
      const wp = await prisma.workerPermission.findUnique({ where: { userId: user.id } });
      return { user: { ...userResponse, workerPages: wp?.pages ?? [] } };
    }

    return { user: userResponse };
  }

  /**
   * Email ve username uygunluk kontrolü.
   * Hem User tablosuna hem PendingRegistration tablosuna bakar.
   * Birinde varsa available=false döner.
   * Public + throttled.
   */
  @Public()
  @Get('check-availability')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async checkAvailability(
    @Query('email') email?: string,
    @Query('username') username?: string,
  ) {
    const result = { emailAvailable: true, usernameAvailable: true };
    const pendingRepo = new PrismaPendingRegistrationRepository();

    const e = (email || '').trim().toLowerCase();
    if (e) {
      const existingUser = await this.userRepo.findByEmail(e);
      if (existingUser) {
        result.emailAvailable = false;
      } else {
        const existingPending = await pendingRepo.findByEmail(e);
        if (existingPending) result.emailAvailable = false;
      }
    }
    const u = (username || '').trim();
    if (u) {
      const existingUser = await this.userRepo.findByUsername(u);
      if (existingUser) {
        result.usernameAvailable = false;
      } else {
        const existingPending = await pendingRepo.findByUsername(u);
        if (existingPending) result.usernameAvailable = false;
      }
    }
    return result;
  }

  /**
   * Yeni aday kaydı.
   * Yeni davranış: PendingRegistration'a yazar, User oluşturmaz.
   * Doğrulama maili gönderilir. Return: { message, email }.
   */
  @Post('register')
  @Public()
  @RequireCaptcha()
  async register(@Body() body: any, @Req() req: any) {
    try {
      let uc = this.registerUseCase;
      if (!uc) {
        const repo = new PrismaUserRepository();
        const pwd = new PasswordService();
        const pendingRepo = new PrismaPendingRegistrationRepository();
        uc = new RegisterUseCase(
          repo,
          pwd,
          new PrismaContractRepository(prisma),
          new PrismaContractAcceptanceRepository(prisma),
          new PrismaAuditLogRepository(),
          pendingRepo,
        );
      }
      const ip = (req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        || (req?.socket?.remoteAddress as string | undefined);
      const userAgent = req?.headers?.['user-agent'] as string | undefined;

      const result = await uc.execute(body, { ip, userAgent });

      // Yeni akış: result.message vardır ve User henüz oluşmamıştır.
      // PendingRegistration token'ını al ve doğrulama maili gönder.
      if (result.message === 'Doğrulama maili gönderildi') {
        try {
          const pendingRepo = new PrismaPendingRegistrationRepository();
          const pending = await pendingRepo.findByEmail(
            (body.email || '').trim().toLowerCase(),
          );
          if (pending) {
            const sendVerify = new SendEmailVerificationUseCase();
            await sendVerify.execute({ pendingRegistrationId: pending.id });
          }
        } catch {
          // Email gönderim hatası kayıt akışını bozmaz
        }
        return result;
      }

      // Fallback (eski akış, pendingRepo DI'sız): email doğrulama maili userId ile gönder
      try {
        if ((result as any).id) {
          const sendVerify = new SendEmailVerificationUseCase();
          await sendVerify.execute({ userId: (result as any).id });
        }
      } catch {
        // Email gönderim hatası kayıt akışını bozmaz
      }

      return result;
    } catch (err: any) {
      if (err.code === 'EMAIL_ALREADY_REGISTERED' || err.message === 'DUPLICATE_EMAIL') {
        throw new HttpException({ error: 'Bu e-posta adresi zaten kayıtlı.', code: 'EMAIL_ALREADY_REGISTERED' }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'USERNAME_ALREADY_TAKEN' || err.message === 'DUPLICATE_USERNAME') {
        throw new HttpException({ error: 'Bu kullanıcı adı zaten alınmış.', code: 'USERNAME_ALREADY_TAKEN' }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'TERMS_NOT_ACCEPTED') {
        throw new HttpException({ error: err.message, code: err.code }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'CONTRACTS_NOT_AVAILABLE') {
        throw new HttpException({ error: err.message, code: err.code }, HttpStatus.SERVICE_UNAVAILABLE);
      }
      console.error('[register] unexpected error:', err?.message, err?.stack);
      throw new HttpException({ error: 'Kayıt sırasında hata oluştu' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Email doğrulama — token ile PendingRegistration'ı User'a promote eder ya da User.emailVerified=true yapar */
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
   * Hem PendingRegistration'a hem User'a bakar.
   * Kullanıcı numaralandırma saldırılarına karşı: her zaman 200.
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

    // Önce PendingRegistration kontrol et
    try {
      const pendingRepo = new PrismaPendingRegistrationRepository();
      const pending = await pendingRepo.findByEmail(email);
      if (pending) {
        // Yeni token üret ve pending'i güncelle
        const newToken = randomBytes(32).toString('hex');
        const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        // Raw SQL — Prisma client regenerate edilmedi (Windows EPERM)
        await prisma.$executeRaw`
          UPDATE pending_registrations
          SET "verificationToken" = ${newToken},
              "verificationTokenExpiresAt" = ${newExpiresAt}
          WHERE email = ${email}
        `;
        // Güncel pending'i al ve mail gönder
        const updatedPending = await pendingRepo.findByEmail(email);
        if (updatedPending) {
          const sendVerify = new SendEmailVerificationUseCase();
          await sendVerify.execute({ pendingRegistrationId: updatedPending.id });
        }
        return { message: 'Doğrulama bağlantısı yeniden gönderildi.' };
      }
    } catch {
      // hata durumunda sessizce devam et
    }

    // User tablosunda kontrol et (legacy)
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
   * Eğitici kaydı.
   * Yeni davranış: PendingRegistration'a yazar, User oluşturmaz.
   * Return: { message, email }.
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
      cvUrl?: string;
      specializations?: string[];
      educationInfo?: string;
      bio?: string;
      linkedinUrl?: string;
      websiteUrl?: string;
    },
    @Req() req: any,
  ) {
    try {
      let uc = this.registerEducatorUseCase;
      if (!uc) {
        const pendingRepo = new PrismaPendingRegistrationRepository();
        uc = new RegisterEducatorUseCase(
          new PrismaUserRepository(),
          new PrismaContractRepository(prisma),
          new PrismaContractAcceptanceRepository(prisma),
          new PrismaAuditLogRepository(),
          new PasswordService(),
          new JwtService(),
          pendingRepo,
        );
      }
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
          cvUrl: body.cvUrl,
          specializations: Array.isArray(body.specializations) ? body.specializations : [],
          educationInfo: body.educationInfo,
          bio: body.bio,
          linkedinUrl: body.linkedinUrl,
          websiteUrl: body.websiteUrl,
        },
        { ip, userAgent },
      );

      // Yeni akış: PendingRegistration oluşturulmuşsa mail gönder
      if ((result as any).message === 'Doğrulama maili gönderildi') {
        try {
          const pendingRepo = new PrismaPendingRegistrationRepository();
          const pending = await pendingRepo.findByEmail(
            (body.email || '').trim().toLowerCase(),
          );
          if (pending) {
            const sendVerify = new SendEmailVerificationUseCase();
            await sendVerify.execute({ pendingRegistrationId: pending.id });
          }
        } catch {
          // Email gönderim hatası kayıt akışını bozmaz
        }
        return result;
      }

      // Fallback (eski akış): userId ile mail gönder
      try {
        if ((result as any).user?.id) {
          const sendVerify = new SendEmailVerificationUseCase();
          await sendVerify.execute({ userId: (result as any).user.id });
        }
      } catch {
        // Email gönderim hatası kayıt akışını bozmaz
      }

      return result;
    } catch (err: any) {
      if (err.code === 'CONTRACT_NOT_AVAILABLE') {
        throw new HttpException({ error: 'Eğitici sözleşmesi henüz tanımlanmamış.' }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'CV_REQUIRED') {
        throw new HttpException({ error: err.message || 'CV yüklemesi zorunludur', code: err.code }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'SPECIALIZATION_REQUIRED') {
        throw new HttpException({ error: err.message || 'En az bir uzmanlık alanı seçilmelidir', code: err.code }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'TERMS_NOT_ACCEPTED') {
        throw new HttpException({ error: err.message, code: err.code }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'FIRSTNAME_REQUIRED' || err.code === 'FIRSTNAME_INVALID') {
        throw new HttpException({ error: err.message || 'Ad gereklidir', code: err.code }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'LASTNAME_REQUIRED' || err.code === 'LASTNAME_INVALID') {
        throw new HttpException({ error: err.message || 'Soyad gereklidir', code: err.code }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'EMAIL_ALREADY_REGISTERED' || err.message === 'DUPLICATE_EMAIL') {
        throw new HttpException({ error: 'Bu e-posta adresi zaten kayıtlı.', code: 'EMAIL_ALREADY_REGISTERED' }, HttpStatus.BAD_REQUEST);
      }
      if (err.code === 'USERNAME_ALREADY_TAKEN' || err.message === 'DUPLICATE_USERNAME') {
        throw new HttpException({ error: 'Bu kullanıcı adı zaten alınmış.', code: 'USERNAME_ALREADY_TAKEN' }, HttpStatus.BAD_REQUEST);
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
      let uc = this.loginUseCase;
      if (!uc) {
        const repo = new PrismaUserRepository();
        const pwd = new PasswordService();
        const jwt = new JwtService();
        const { SendEmailUseCase } = require('../../application/use-cases/email/SendEmailUseCase');
        const { NotifyNewDeviceLoginUseCase } = require('../../application/use-cases/auth/NotifyNewDeviceLoginUseCase');
        const notifyDevice = new NotifyNewDeviceLoginUseCase(new SendEmailUseCase());
        uc = new LoginUseCase(repo, pwd, jwt, undefined, notifyDevice);
      }
      const ctx = auditContextFromRequest(req);
      const result = await uc.execute({ email, password }, ctx);
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

  /** Şifre sıfırlama e-postası gönderir; kullanıcı bulunamasa da 200 döner */
  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  async forgotPassword(@Body() body: any) {
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!email) throw new HttpException({ error: 'E-posta gerekli' }, HttpStatus.BAD_REQUEST);
    await this.forgotPasswordUC.execute(email);
    return { message: 'E-posta gönderildi' };
  }

  /** Token ile yeni şifre belirler */
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

  /**
   * Oturum açmış kullanıcının şifresini değiştirir.
   * Public DEĞİL — JWT zorunlu; kullanıcı ID token'dan (req.user.sub) alınır.
   * Mevcut şifre backend'de doğrulanır; eşleşmezse 400 INVALID_CURRENT_PASSWORD.
   */
  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException({ error: 'Oturum bulunamadı', code: 'UNAUTHORIZED' }, HttpStatus.UNAUTHORIZED);
    }
    try {
      await this.changePasswordUC.execute(userId, dto.currentPassword, dto.newPassword);
      return { message: 'Şifre güncellendi' };
    } catch (err: any) {
      throw new HttpException(
        { error: err.message || 'İşlem başarısız', code: err.code ?? 'CHANGE_PASSWORD_FAILED' },
        err.status ?? HttpStatus.BAD_REQUEST,
      );
    }
  }
}
