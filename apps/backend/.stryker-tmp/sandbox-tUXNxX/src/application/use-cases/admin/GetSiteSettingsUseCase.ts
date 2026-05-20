// @ts-nocheck
import type { SiteSettings } from '../../../domain/types';

/** Veritabanında kayıt yoksa kullanılan varsayılan site ayarları — fail-open */
const DEFAULTS: SiteSettings = {
  siteName: 'Dal',
  heroTitle: 'Sınavlara Güvenle Hazırlan',
  heroSubtitle: 'Alanında uzman eğiticilerden binlerce test çöz, performansını takip et ve hedefine ulaş.',
  searchPlaceholder: 'Test, konu veya eğitici ara...',
  statTests: '10.000+ Test',
  statEducators: '500+ Eğitici',
  statCandidates: '100.000+ Aday',
  statSuccessRate: '%85 Başarı Oranı',
  footerDescription: 'Sınavlara hazırlık için en güvenilir platform. Alanında uzman eğiticilerden test çöz, performansını takip et.',
  companyName: null,
  contactEmail: null,
  contactPhone: null,
  address: null,
  linkAbout: null,
  linkPrivacy: null,
  linkContact: null,
  linkPartnership: null,
  linkSupport: null,
  copyrightText: '© 2024 Dal. Tüm hakları saklıdır.',
};

/**
 * Site içerik ayarlarını getirir (hero başlık, istatistikler, footer vb.).
 * Kayıt bulunamazsa DEFAULTS ile fail-open çalışır.
 */
export class GetSiteSettingsUseCase {
  async execute(prisma: { siteSettings: { findUnique: (args: any) => Promise<any> } }): Promise<SiteSettings> {
    const row = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    // Satır yoksa varsayılanları döndür (sistem açık kalmaya devam eder)
    if (!row) return DEFAULTS;
    return {
      siteName: row.siteName ?? DEFAULTS.siteName,
      heroTitle: row.heroTitle ?? DEFAULTS.heroTitle,
      heroSubtitle: row.heroSubtitle ?? DEFAULTS.heroSubtitle,
      searchPlaceholder: row.searchPlaceholder ?? DEFAULTS.searchPlaceholder,
      statTests: row.statTests ?? DEFAULTS.statTests,
      statEducators: row.statEducators ?? DEFAULTS.statEducators,
      statCandidates: row.statCandidates ?? DEFAULTS.statCandidates,
      statSuccessRate: row.statSuccessRate ?? DEFAULTS.statSuccessRate,
      footerDescription: row.footerDescription ?? DEFAULTS.footerDescription,
      companyName: row.companyName ?? null,
      contactEmail: row.contactEmail ?? null,
      contactPhone: row.contactPhone ?? null,
      address: row.address ?? null,
      linkAbout: row.linkAbout ?? null,
      linkPrivacy: row.linkPrivacy ?? null,
      linkContact: row.linkContact ?? null,
      linkPartnership: row.linkPartnership ?? null,
      linkSupport: row.linkSupport ?? null,
      copyrightText: row.copyrightText ?? DEFAULTS.copyrightText,
    };
  }
}
