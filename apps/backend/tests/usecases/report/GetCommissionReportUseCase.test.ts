/**
 * GetCommissionReportUseCase testleri
 *
 * Doğrulanan davranışlar:
 * - Geçersiz yıl → Error('Invalid year')
 * - Geçersiz ay → Error('Invalid month')
 * - Boş dönem → items: [], toplamlar 0
 * - Normal satışlarda komisyon hesaplanır
 * - Canlı test satışları (isTimed=true) komisyonsuz
 * - exportCsv UTF-8 BOM ile başlar
 * - exportCsv doğru kolon sayısı
 */

jest.mock('../../../src/infrastructure/database/prisma', () => ({
  prisma: {
    adminSettings: { findFirst: jest.fn() },
    commissionRateHistory: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  },
  // dbRouter.prismaRead() bu modülden isReplicaEnabled'i çağırır; replica
  // kapalıyken primary (mock prisma) döner.
  isReplicaEnabled: () => false,
  prismaReplica: undefined,
}));

import { GetCommissionReportUseCase } from '../../../src/application/use-cases/report/GetCommissionReportUseCase';
import { prisma } from '../../../src/infrastructure/database/prisma';

const mockPrisma = prisma as any;

describe('GetCommissionReportUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.adminSettings.findFirst.mockResolvedValue({ commissionPercent: 20 });
    mockPrisma.commissionRateHistory.findMany.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
  });

  it('geçersiz yıl ise Error fırlatır', async () => {
    const uc = new GetCommissionReportUseCase();
    await expect(uc.execute(1999, 1)).rejects.toThrow('Invalid year');
  });

  it('2100 üstü yıl ise Error fırlatır', async () => {
    const uc = new GetCommissionReportUseCase();
    await expect(uc.execute(2101, 1)).rejects.toThrow('Invalid year');
  });

  it('geçersiz ay ise Error fırlatır', async () => {
    const uc = new GetCommissionReportUseCase();
    await expect(uc.execute(2025, 0)).rejects.toThrow('Invalid month');
  });

  it('ay 13 ise Error fırlatır', async () => {
    const uc = new GetCommissionReportUseCase();
    await expect(uc.execute(2025, 13)).rejects.toThrow('Invalid month');
  });

  it('boş dönemde items boş ve toplamlar sıfır döner', async () => {
    const uc = new GetCommissionReportUseCase();
    const result = await uc.execute(2025, 1);
    expect(result.items).toHaveLength(0);
    expect(result.totalNormalSalesCents).toBe(0);
    expect(result.totalCommissionCents).toBe(0);
    expect(result.totalLiveSalesCents).toBe(0);
    expect(result.totalPayoutCents).toBe(0);
  });

  it('adminSettings null ise komisyon %20 varsayılan', async () => {
    mockPrisma.adminSettings.findFirst.mockResolvedValue(null);
    const uc = new GetCommissionReportUseCase();
    const result = await uc.execute(2025, 1);
    expect(result.commissionPercent).toBe(20);
  });

  // Normal/canlı sorgusu ile tünel sorgusunu SQL içeriğine göre ayır (tünel ikinci query).
  const mockRows = (normalRows: any[], tunnelRows: any[] = [], writtenRows: any[] = []) =>
    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('tunnel_purchases')
          ? tunnelRows
          : sql.includes('written_purchases')
            ? writtenRows
            : normalRows,
      ),
    );

  it('normal satışlarda komisyon hesaplanır', async () => {
    mockPrisma.adminSettings.findFirst.mockResolvedValue({ commissionPercent: 20 });
    mockRows([
      {
        educatorId: 'edu-1',
        username: 'educator1',
        email: 'edu@test.com',
        iban: null,
        bankName: null,
        accountHolder: null,
        isTimed: false,
        saleCount: BigInt(2),
        totalSalesCents: BigInt(10000),
        purchaseDate: new Date(2025, 0, 15),
      },
    ]);
    const uc = new GetCommissionReportUseCase();
    const result = await uc.execute(2025, 1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].normalSalesCents).toBe(10000);
    expect(result.items[0].commissionCents).toBe(2000); // %20 komisyon
    expect(result.items[0].normalPayoutCents).toBe(8000);
  });

  it('canlı test satışlarında (isTimed=true) komisyon uygulanmaz', async () => {
    mockRows([
      {
        educatorId: 'edu-2',
        username: 'live_edu',
        email: 'live@test.com',
        iban: null,
        bankName: null,
        accountHolder: null,
        isTimed: true,
        saleCount: BigInt(3),
        totalSalesCents: BigInt(15000),
        purchaseDate: new Date(2025, 0, 15),
      },
    ]);
    const uc = new GetCommissionReportUseCase();
    const result = await uc.execute(2025, 1);
    expect(result.items[0].liveSalesCents).toBe(15000);
    expect(result.items[0].commissionCents).toBe(0);
    expect(result.items[0].totalPayoutCents).toBe(15000);
  });

  it('tünel satışlarına komisyon uygulanır ve toplamlara dahil edilir', async () => {
    mockPrisma.adminSettings.findFirst.mockResolvedValue({ commissionPercent: 20 });
    mockRows(
      [], // normal/canlı satış yok
      [
        {
          educatorId: 'edu-3',
          username: 'tunnel_edu',
          email: 'tunnel@test.com',
          iban: null,
          bankName: null,
          accountHolder: null,
          saleCount: BigInt(4),
          totalSalesCents: BigInt(20000),
          purchaseDate: new Date(2025, 0, 15),
        },
      ],
    );
    const uc = new GetCommissionReportUseCase();
    const result = await uc.execute(2025, 1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tunnelSaleCount).toBe(4);
    expect(result.items[0].tunnelSalesCents).toBe(20000);
    expect(result.items[0].tunnelCommissionCents).toBe(4000); // %20
    expect(result.items[0].tunnelPayoutCents).toBe(16000);
    expect(result.items[0].totalSalesCents).toBe(20000);
    expect(result.items[0].totalPayoutCents).toBe(16000);
    expect(result.totalTunnelSalesCents).toBe(20000);
    expect(result.totalSalesCents).toBe(20000);
    expect(result.totalPayoutCents).toBe(16000);
  });

  it('exportCsv UTF-8 BOM ile başlar', async () => {
    const uc = new GetCommissionReportUseCase();
    const csv = await uc.exportCsv(2025, 1);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('exportCsv ilk satır başlık satırı içerir', async () => {
    const uc = new GetCommissionReportUseCase();
    const csv = await uc.exportCsv(2025, 1);
    expect(csv).toContain('Eğitici');
    expect(csv).toContain('Komisyon');
  });
});
