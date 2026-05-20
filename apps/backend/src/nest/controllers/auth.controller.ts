import { Controller, Post, Body, Get, Req, HttpException, HttpStatus, UseGuards, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RegisterUseCase } from '../../application/use-cases/auth/RegisterUseCase';
import { RegisterEducatorUseCase } from '../../application/use-cases/auth/RegisterEducatorUseCase';
import { LoginUseCase } from '../../application/use-cases/auth/LoginUseCase';
import { ForgotPasswordUseCase } from '../../application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../../application/use-cases/auth/ResetPasswordUseCase';
import { Public } from '../decorators/public.decorator';
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
  ) {}

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

  /** Yeni aday kaydı — e-posta ve kullanıcı adı benzersizliği use-case tarafından doğrulanır */
  @Post('register')
  @Public()
  async register(@Body() body: any) {
    try {
      const user = await this.registerUseCase.execute(body);
      return user;
    } catch (err: any) {
      if (err.message === 'DUPLICATE_EMAIL') {
        throw new HttpException({ error: 'Bu e-posta adresi zaten kayıtlı.' }, HttpStatus.CONFLICT);
      }
      if (err.message === 'DUPLICATE_USERNAME') {
        throw new HttpException({ error: 'Bu kullanıcı adı zaten alınmış.' }, HttpStatus.CONFLICT);
      }
      throw new HttpException({ error: 'Kayıt sırasında hata oluştu' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Eğitici kaydı — sözleşme varlığı kontrol edilir; 30 istek/5 dakika throttle uygulanır */
  @Post('register/educator')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 300000 } })
  async registerEducator(@Body() body: RegisterEducatorDto) {
    try {
      return await this.registerEducatorUseCase.execute({
        email: body.email,
        username: body.username,
        password: body.password,
      });
    } catch (err: any) {
      if (err.code === 'CONTRACT_NOT_AVAILABLE') {
        throw new HttpException({ error: 'Eğitici sözleşmesi henüz tanımlanmamış.' }, HttpStatus.BAD_REQUEST);
      }
      if (err.message === 'DUPLICATE_EMAIL') {
        throw new HttpException({ error: 'Bu e-posta adresi zaten kayıtlı.' }, HttpStatus.CONFLICT);
      }
      if (err.message === 'DUPLICATE_USERNAME') {
        throw new HttpException({ error: 'Bu kullanıcı adı zaten alınmış.' }, HttpStatus.CONFLICT);
      }
      throw new HttpException({ error: 'Kayıt sırasında hata oluştu' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Giriş — BruteforceGuard ile korunur; e-posta küçük harfe normalize edilir */
  @Post('login')
  @HttpCode(200)
  @Public()
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
      const uc = this.loginUseCase ?? new LoginUseCase(new PrismaUserRepository(), new PasswordService(), new JwtService());
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
