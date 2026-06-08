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
    // minPackagePriceCents / maxDiscountPercent Prisma client'ta olmayabilir; raw okuma güvenli yol
    const raw = await (this.prisma as any).$queryRaw<
      { minPackagePriceCents: number; maxDiscountPercent: number; googleClientId: string | null; maxTestsPerPackage: number | null }[]
    >`
      SELECT "minPackagePriceCents", "maxDiscountPercent", "googleClientId", "maxTestsPerPackage" FROM admin_settings WHERE id = 1
    `;
    // googleClientId: DB önce — yoksa env fallback
    const dbGci = raw[0]?.googleClientId ?? null;
    const envGci = process.env.GOOGLE_CLIENT_ID ?? null;
    const effectiveGci = dbGci && dbGci.trim() ? dbGci.trim() : (envGci && envGci.trim() ? envGci.trim() : null);
    return {
      purchasesEnabled:       row?.purchasesEnabled                    ?? true,
      packageCreationEnabled: row?.packageCreationEnabled              ?? true,
      testPublishingEnabled:  row?.testPublishingEnabled               ?? true,
      testAttemptsEnabled:    row?.testAttemptsEnabled                 ?? true,
      adPurchasesEnabled:     (row as any)?.adPurchasesEnabled         ?? true,
      minPackagePriceCents:   raw[0]?.minPackagePriceCents             ?? 100,
      maxDiscountPercent:     raw[0]?.maxDiscountPercent               ?? 50,
      maxTestsPerPackage:     raw[0]?.maxTestsPerPackage               ?? 10,
      googleClientId:         effectiveGci,
      googleSignInEnabled:    !!effectiveGci,
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

  /**
   * Kamuya açık entegrasyon yapılandırması — frontend'in tarayıcıda göstermesi
   * için güvenli olan public anahtarları döndürür. Secret key'ler asla
   * gönderilmez.
   *
   * Anahtar boşsa null döner → frontend ilgili entegrasyonu render etmez
   * (örn. Turnstile widget'ı hiç yüklenmez).
   */
  @Get('integrations/public')
  @Public()
  @ApiOkResponse({ description: 'Public integration keys (Turnstile site key, Google OAuth client ID)' })
  async getPublicIntegrations() {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ turnstileSiteKey: string | null; googleClientId: string | null }>>`
        SELECT "turnstileSiteKey", "googleClientId" FROM admin_settings WHERE id = 1
      `;
      const r = rows?.[0] ?? {};
      return {
        turnstileSiteKey: r.turnstileSiteKey || null,
        googleClientId: r.googleClientId || null,
      };
    } catch {
      return { turnstileSiteKey: null, googleClientId: null };
    }
  }
}
