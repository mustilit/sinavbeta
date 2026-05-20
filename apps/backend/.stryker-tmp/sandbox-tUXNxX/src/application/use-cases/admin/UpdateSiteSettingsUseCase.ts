// @ts-nocheck
import type { SiteSettings } from '../../../domain/types';

/** Güncellenebilir site içerik alanları — hepsi opsiyonel (partial update) */
export type UpdateSiteSettingsInput = Partial<{
  siteName: string;
  heroTitle: string;
  heroSubtitle: string;
  searchPlaceholder: string;
  statTests: string;
  statEducators: string;
  statCandidates: string;
  statSuccessRate: string;
  footerDescription: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  linkAbout: string;
  linkPrivacy: string;
  linkContact: string;
  linkPartnership: string;
  linkSupport: string;
  copyrightText: string;
}>;

/**
 * Site içerik ayarlarını günceller. id=1 satırı yoksa oluşturur (upsert).
 * Sadece gönderilen alanlar güncellenir — eksik alanlar dokunulmaz.
 */
export class UpdateSiteSettingsUseCase {
  async execute(
    prisma: { siteSettings: { upsert: (args: any) => Promise<any> } },
    input: UpdateSiteSettingsInput,
  ): Promise<SiteSettings> {
    const update: Record<string, unknown> = {};
    // Gönderilmeyen alanları atla — partial update uygula
    const keys = [
      'siteName', 'heroTitle', 'heroSubtitle', 'searchPlaceholder',
      'statTests', 'statEducators', 'statCandidates', 'statSuccessRate',
      'footerDescription', 'companyName', 'contactEmail', 'contactPhone', 'address',
      'linkAbout', 'linkPrivacy', 'linkContact', 'linkPartnership', 'linkSupport', 'copyrightText',
    ] as const;
    for (const k of keys) {
      if (input[k] !== undefined) update[k] = input[k];
    }
    const row = await prisma.siteSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...update },
      update,
    });
    return {
      siteName: row.siteName,
      heroTitle: row.heroTitle,
      heroSubtitle: row.heroSubtitle,
      searchPlaceholder: row.searchPlaceholder,
      statTests: row.statTests,
      statEducators: row.statEducators,
      statCandidates: row.statCandidates,
      statSuccessRate: row.statSuccessRate,
      footerDescription: row.footerDescription,
      companyName: row.companyName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      address: row.address,
      linkAbout: row.linkAbout,
      linkPrivacy: row.linkPrivacy,
      linkContact: row.linkContact,
      linkPartnership: row.linkPartnership,
      linkSupport: row.linkSupport,
      copyrightText: row.copyrightText,
    };
  }
}
