import { Controller, Get, Patch, Body, Inject, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import type { PrismaClient } from '@prisma/client';
import { GetAdminSettingsUseCase } from '../../application/use-cases/admin/GetAdminSettingsUseCase';
import { UpdateAdminSettingsUseCase } from '../../application/use-cases/admin/UpdateAdminSettingsUseCase';
import { UpdateAdminSettingsDto } from './dto/update-admin-settings.dto';
import { GetAdminPaymentSettingsUseCase } from '../../application/use-cases/admin/GetAdminPaymentSettingsUseCase';
import { UpdatePaymentSettingsUseCase } from '../../application/use-cases/admin/UpdatePaymentSettingsUseCase';
import { auditContextFromRequest } from '../../infrastructure/audit/AuditLogger';

/**
 * Admin uygulama ayarları — satın alma kill-switch gibi özellik bayraklarını
 * okur ve günceller. Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/settings')
@ApiTags('admin/settings')
export class AdminSettingsController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(GetAdminSettingsUseCase) private readonly getSettings: GetAdminSettingsUseCase,
    @Inject(UpdateAdminSettingsUseCase) private readonly updateSettings: UpdateAdminSettingsUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Admin settings' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async get() {
    return this.getSettings.execute(this.prisma);
  }

  @Patch()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Settings updated' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async update(@Body() dto: UpdateAdminSettingsDto, @Req() req: any) {
    // Audit context: actorId/email/role + ip/userAgent — admin değişikliği takibi
    const ctx = auditContextFromRequest(req);
    return this.updateSettings.execute(
      this.prisma,
      {
        commissionPercent: dto.commissionPercent,
        vatPercent: dto.vatPercent,
        purchasesEnabled: dto.purchasesEnabled,
        packageCreationEnabled: dto.packageCreationEnabled,
        testPublishingEnabled: dto.testPublishingEnabled,
        testAttemptsEnabled: dto.testAttemptsEnabled,
        adPurchasesEnabled: dto.adPurchasesEnabled,
        twoFactorSystemEnabled: dto.twoFactorSystemEnabled,
        minPackagePriceCents: dto.minPackagePriceCents,
        minQuestionsPerTest: dto.minQuestionsPerTest,
        maxQuestionsPerTest: dto.maxQuestionsPerTest,
        maxTestsPerPackage: dto.maxTestsPerPackage,
        maxLiveQuestions: dto.maxLiveQuestions,
      },
      ctx,
    );
  }

  @Get('payment-settings')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Payment provider settings' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async getPaymentSettings() {
    const uc = new GetAdminPaymentSettingsUseCase();
    return uc.execute();
  }

  @Patch('payment-settings')
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Payment settings updated' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async updatePaymentSettings(@Body() body: any) {
    const uc = new UpdatePaymentSettingsUseCase();
    return uc.execute(body);
  }
}
