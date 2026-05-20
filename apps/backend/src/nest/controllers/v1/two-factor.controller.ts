/**
 * TwoFactorController — `/v1/auth/2fa/*` endpoint'leri.
 *
 * Endpoint'ler:
 *   POST /v1/auth/2fa/setup            — kurulum başlat (QR + recovery)
 *   POST /v1/auth/2fa/verify-setup     — kurulum kodunu doğrula → 2FA aktif
 *   POST /v1/auth/2fa/verify-login     — login adımında 2. faktör (Public)
 *   POST /v1/auth/2fa/disable          — 2FA'yı kapat (şifre tekrar doğrulanır)
 *
 * `verify-login` haricinde tüm endpoint'ler authenticated kullanıcı gerektirir.
 *
 * İlgili use case'ler:
 *   - SetupTwoFactorUseCase (setup + verifySetup)
 *   - VerifyTwoFactorLoginUseCase
 *   - DisableTwoFactorUseCase
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../decorators/public.decorator';
import { auditContextFromRequest } from '../../../infrastructure/audit/AuditLogger';
import { SetupTwoFactorUseCase } from '../../../application/use-cases/auth/SetupTwoFactorUseCase';
import { VerifyTwoFactorLoginUseCase } from '../../../application/use-cases/auth/VerifyTwoFactorLoginUseCase';
import { DisableTwoFactorUseCase } from '../../../application/use-cases/auth/DisableTwoFactorUseCase';
import {
  VerifySetupTwoFactorDto,
  VerifyLoginTwoFactorDto,
  DisableTwoFactorDto,
} from '../dto/two-factor.dto';

@ApiTags('auth-2fa')
@ApiBearerAuth('bearer')
@Controller({ path: 'auth/2fa', version: '1' })
export class TwoFactorController {
  constructor(
    private readonly setupUseCase: SetupTwoFactorUseCase,
    private readonly verifyLoginUseCase: VerifyTwoFactorLoginUseCase,
    private readonly disableUseCase: DisableTwoFactorUseCase,
  ) {}

  /** Kurulum başlat — QR PNG + recovery code'lar + kısa-ömürlü pendingSecretToken döner. */
  @Post('setup')
  @ApiOkResponse({ description: '2FA setup payload (QR + recovery + pending token).' })
  @ApiUnauthorizedResponse({ description: 'Kimlik doğrulama gerekli.' })
  async setup(@Req() req: any) {
    const userId = req.user?.sub;
    if (!userId) throw new HttpException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED);
    const ctx = auditContextFromRequest(req);
    return this.setupUseCase.setup(ctx, userId);
  }

  /** Kurulum kodunu doğrula — başarılıysa 2FA DB'de aktive edilir (204). */
  @Post('verify-setup')
  @HttpCode(204)
  @ApiBody({ type: VerifySetupTwoFactorDto })
  @ApiNoContentResponse({ description: '2FA aktive edildi.' })
  @ApiBadRequestResponse({ description: 'Kod yanlış veya token geçersiz.' })
  @ApiUnauthorizedResponse({ description: 'Kimlik doğrulama gerekli.' })
  async verifySetup(@Body() dto: VerifySetupTwoFactorDto, @Req() req: any) {
    const userId = req.user?.sub;
    if (!userId) throw new HttpException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED);
    const ctx = auditContextFromRequest(req);
    await this.setupUseCase.verifySetup(ctx, userId, dto.pendingSecretToken, dto.code);
  }

  /** Login akışında 2. faktör — başarıyla doğrulandığında asıl access token döner. */
  @Post('verify-login')
  @HttpCode(200)
  @Public()
  @ApiBody({ type: VerifyLoginTwoFactorDto })
  @ApiOkResponse({ description: '{ accessToken, user }' })
  @ApiUnauthorizedResponse({ description: 'Token süresi dolmuş veya kod yanlış.' })
  async verifyLogin(@Body() dto: VerifyLoginTwoFactorDto, @Req() req: any) {
    const ctx = auditContextFromRequest(req);
    return this.verifyLoginUseCase.execute(ctx, dto.pendingMfaToken, dto.code);
  }

  /** 2FA'yı devre dışı bırak — şifre tekrar doğrulanır (204). */
  @Post('disable')
  @HttpCode(204)
  @ApiBody({ type: DisableTwoFactorDto })
  @ApiNoContentResponse({ description: '2FA devre dışı bırakıldı.' })
  @ApiBadRequestResponse({ description: '2FA zaten kapalı veya şifre eksik.' })
  @ApiUnauthorizedResponse({ description: 'Şifre yanlış veya kimlik doğrulama gerekli.' })
  async disable(@Body() dto: DisableTwoFactorDto, @Req() req: any) {
    const userId = req.user?.sub;
    if (!userId) throw new HttpException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED);
    const ctx = auditContextFromRequest(req);
    await this.disableUseCase.execute(ctx, userId, dto.password);
  }
}
