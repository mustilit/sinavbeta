/**
 * SiteController unit testleri.
 * Prisma token inject edildiğinden mock nesne geçilir.
 */

jest.mock('../../src/application/use-cases/admin/GetPaymentSettingsUseCase', () => ({
  GetPaymentSettingsUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ stripeEnabled: true, iyzicoEnabled: false }),
  })),
}));

import { SiteController } from '../../src/nest/controllers/site.controller';

describe('SiteController', () => {
  let controller: SiteController;
  let mockPrisma: any;
  let mockGetSiteSettings: { execute: jest.Mock };
  let mockListExamTypes: { execute: jest.Mock };
  let mockListFeaturedEducators: { execute: jest.Mock };
  let mockGetPopularPackages: { execute: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      adminSettings: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          purchasesEnabled: true,
          packageCreationEnabled: true,
          testPublishingEnabled: true,
          testAttemptsEnabled: true,
          adPurchasesEnabled: true,
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ minPackagePriceCents: 100, maxDiscountPercent: 50, googleClientId: null, turnstileSiteKey: null }]),
    };
    mockGetSiteSettings = { execute: jest.fn().mockResolvedValue({ siteName: 'Sınav Salonu' }) };
    mockListExamTypes = { execute: jest.fn().mockResolvedValue([{ id: 'et-1', name: 'KPSS', active: true }]) };
    mockListFeaturedEducators = { execute: jest.fn().mockResolvedValue([{ id: 'edu-1', username: 'hoca1' }]) };
    mockGetPopularPackages = { execute: jest.fn().mockResolvedValue([{ id: 'pkg-1', title: 'Paket A' }]) };

    controller = new SiteController(
      mockPrisma,
      mockGetSiteSettings as any,
      mockListExamTypes as any,
      mockListFeaturedEducators as any,
      mockGetPopularPackages as any,
    );
  });

  describe('getSettings', () => {
    it('site ayarlarını döndürür', async () => {
      const result = await controller.getSettings();
      expect(mockGetSiteSettings.execute).toHaveBeenCalledWith(mockPrisma);
      expect(result).toHaveProperty('siteName', 'Sınav Salonu');
    });
  });

  describe('getExamTypes', () => {
    it('aktif sınav türlerini döndürür', async () => {
      const result = await controller.getExamTypes();
      expect(mockListExamTypes.execute).toHaveBeenCalledWith(true, true);
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('getFeaturedEducators', () => {
    it('öne çıkan eğiticileri döndürür', async () => {
      const result = await controller.getFeaturedEducators('6');
      expect(mockListFeaturedEducators.execute).toHaveBeenCalledWith(mockPrisma, 6, undefined);
      expect(result).toBeInstanceOf(Array);
    });

    it('examTypeIds virgülle ayrılarak parse edilir', async () => {
      await controller.getFeaturedEducators('3', 'et-1,et-2');
      expect(mockListFeaturedEducators.execute).toHaveBeenCalledWith(mockPrisma, 3, ['et-1', 'et-2']);
    });

    it('limit geçersizse varsayılan 6 kullanılır', async () => {
      await controller.getFeaturedEducators('abc');
      expect(mockListFeaturedEducators.execute).toHaveBeenCalledWith(mockPrisma, 6, undefined);
    });
  });

  describe('getServiceStatus', () => {
    it('servis durumu alanlarını döndürür', async () => {
      const result = await controller.getServiceStatus();
      expect(result).toHaveProperty('purchasesEnabled', true);
      expect(result).toHaveProperty('minPackagePriceCents', 100);
      expect(result).toHaveProperty('maxDiscountPercent', 50);
      expect(result).toHaveProperty('googleClientId');
    });

    it('DB row yoksa varsayılan değerler kullanılır', async () => {
      mockPrisma.adminSettings.findFirst.mockResolvedValue(null);
      mockPrisma.$queryRaw.mockResolvedValue([{}]);
      const result = await controller.getServiceStatus();
      expect(result).toHaveProperty('purchasesEnabled', true);
    });
  });

  describe('listPopularPackages', () => {
    it('popüler paketleri döndürür', async () => {
      const result = await controller.listPopularPackages(undefined, '6');
      expect(mockGetPopularPackages.execute).toHaveBeenCalledWith(undefined, 6);
      expect(result).toBeInstanceOf(Array);
    });

    it('examTypeIds ile sorgular', async () => {
      await controller.listPopularPackages('et-1,et-2', '4');
      expect(mockGetPopularPackages.execute).toHaveBeenCalledWith(['et-1', 'et-2'], 4);
    });
  });

  describe('getPublicPaymentSettings', () => {
    it('ödeme sağlayıcı bilgilerini döndürür', async () => {
      const result = await controller.getPublicPaymentSettings();
      expect(result).toHaveProperty('stripeEnabled');
    });
  });

  describe('getPublicIntegrations', () => {
    it('public entegrasyon anahtarlarını döndürür', async () => {
      const result = await controller.getPublicIntegrations();
      expect(result).toHaveProperty('turnstileSiteKey');
      expect(result).toHaveProperty('googleClientId');
    });

    it('DB hatası olduğunda null döner', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('DB bağlantı hatası'));
      const result = await controller.getPublicIntegrations();
      expect(result).toEqual({ turnstileSiteKey: null, googleClientId: null });
    });
  });
});
