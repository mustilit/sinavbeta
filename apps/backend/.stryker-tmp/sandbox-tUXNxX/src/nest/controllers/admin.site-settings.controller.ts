// @ts-nocheck
import { Controller, Get, Patch, Body, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import type { PrismaClient } from '@prisma/client';
import { GetSiteSettingsUseCase } from '../../application/use-cases/admin/GetSiteSettingsUseCase';
import { UpdateSiteSettingsUseCase } from '../../application/use-cases/admin/UpdateSiteSettingsUseCase';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';

/**
 * Admin site ayarları — bakım modu, duyurular vb. genel site konfigürasyonunu
 * okur ve günceller. Sadece ADMIN rolüne açıktır.
 */
@Controller('admin/site-settings')
@ApiTags('admin/site-settings')
export class AdminSiteSettingsController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly getSettings: GetSiteSettingsUseCase,
    private readonly updateSettings: UpdateSiteSettingsUseCase,
  ) {}

  @Get()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Site settings' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async get() {
    return this.getSettings.execute(this.prisma);
  }

  @Patch()
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ description: 'Site settings updated' })
  @ApiForbiddenResponse({ description: 'Forbidden' })
  async update(@Body() dto: UpdateSiteSettingsDto) {
    return this.updateSettings.execute(this.prisma, {
      siteName: dto.siteName,
      heroTitle: dto.heroTitle,
      heroSubtitle: dto.heroSubtitle,
      searchPlaceholder: dto.searchPlaceholder,
      statTests: dto.statTests,
      statEducators: dto.statEducators,
      statCandidates: dto.statCandidates,
      statSuccessRate: dto.statSuccessRate,
      footerDescription: dto.footerDescription,
      companyName: dto.companyName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      address: dto.address,
      linkAbout: dto.linkAbout,
      linkPrivacy: dto.linkPrivacy,
      linkContact: dto.linkContact,
      linkPartnership: dto.linkPartnership,
      linkSupport: dto.linkSupport,
      copyrightText: dto.copyrightText,
    });
  }
}
