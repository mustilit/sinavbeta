// @ts-nocheck
import { Controller, Get, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { GetSiteSettingsUseCase } from '../../application/use-cases/admin/GetSiteSettingsUseCase';
import { ListExamTypesUseCase } from '../../application/use-cases/admin/ListExamTypesUseCase';
import { ListFeaturedEducatorsUseCase } from '../../application/use-cases/educator/ListFeaturedEducatorsUseCase';
import { GetPopularPackagesUseCase } from '../../application/use-cases/package/GetPopularPackagesUseCase';
import { GetPaymentSettingsUseCase } from '../../application/use-cases/admin/GetPaymentSettingsUseCase';
import type { PrismaClient } from '@prisma/client';

/**
 * Site geneli kamuya açık veri endpoint'leri — site ayarları, aktif sınav türleri,
 * öne çıkan eğiticiler ve popüler paketleri döndürür.
 * Tüm endpoint'ler kimlik doğrulama gerektirmez (@Public).
 */
@Controller('site')
@ApiTags('Site')
export class SiteController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(GetSiteSettingsUseCase) private readonly getSiteSettings: GetSiteSettingsUseCase,
    @Inject(ListExamTypesUseCase) private readonly listExamTypes: ListExamTypesUseCase,
    @Inject(ListFeaturedEducatorsUseCase) private readonly listFeaturedEducators: ListFeaturedEducatorsUseCase,
    @Inject(GetPopularPackagesUseCase) private readonly getPopularPackages: GetPopularPackagesUseCase,
  ) {}

  @Get('settings')
  @Public()
  @ApiOkResponse({ description: 'Site settings for homepage and footer' })
  async getSettings() {
    return this.getSiteSettings.execute(this.prisma);
  }

  @Get('exam-types')
  @Public()
  @ApiOkResponse({ description: 'Active exam types for homepage' })
  async getExamTypes() {
    return this.listExamTypes.execute(true);
  }

  @Get('featured-educators')
  @Public()
  @ApiOkResponse({ description: 'Featured educators for homepage' })
  async getFeaturedEducators(
    @Query('limit') limit?: string,
    @Query('examTypeIds') examTypeIds?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 6;
    const parsedExamTypeIds = examTypeIds
      ? examTypeIds.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return this.listFeaturedEducators.execute(
      this.prisma,
      isNaN(n) ? 6 : n,
      parsedExamTypeIds,
    );
  }

  @Get('service-status')
  @Public()
  @ApiOkResponse({ description: 'Current kill-switch status for all services' })
  async getServiceStatus() {
    const row = await this.prisma.adminSettings.findFirst({ where: { id: 1 } });
    // minPackagePriceCents Prisma client'ta olmayabilir; raw okuma güvenli yol
    const raw = await (this.prisma as any).$queryRaw<{ minPackagePriceCents: number }[]>`
      SELECT "minPackagePriceCents" FROM admin_settings WHERE id = 1
    `;
    return {
      purchasesEnabled:       row?.purchasesEnabled                    ?? true,
      packageCreationEnabled: row?.packageCreationEnabled              ?? true,
      testPublishingEnabled:  row?.testPublishingEnabled               ?? true,
      testAttemptsEnabled:    row?.testAttemptsEnabled                 ?? true,
      adPurchasesEnabled:     (row as any)?.adPurchasesEnabled         ?? true,
      minPackagePriceCents:   raw[0]?.minPackagePriceCents             ?? 100,
    };
  }

  @Get('popular-packages')
  @Public()
  @ApiOkResponse({ description: 'Popular test packages sorted by purchase count' })
  async listPopularPackages(
    @Query('examTypeIds') examTypeIds?: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 6;
    const parsedExamTypeIds = examTypeIds
      ? examTypeIds.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    return this.getPopularPackages.execute(parsedExamTypeIds, isNaN(n) ? 6 : n);
  }

  @Get('payment-settings')
  @Public()
  @ApiOkResponse({ description: 'Public payment provider settings (providers enabled, mode, company name)' })
  async getPublicPaymentSettings() {
    const uc = new GetPaymentSettingsUseCase();
    return uc.execute();
  }
}
