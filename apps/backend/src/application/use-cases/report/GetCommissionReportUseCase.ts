import { prisma } from '../../../infrastructure/database/prisma';
import { prismaRead } from '../../../infrastructure/database/dbRouter';
import type { CommissionRateHistory } from '@prisma/client';

// Sprint 10 — Bu use case admin raporlama. Lag toleranslı; replica'ya yönlendirildi.
// AdminSettings ve CommissionRateHistory mutation'larından sonraki ilk okuma için
// 5s lag göz ardı edilebilir (raporlar günlük gözle bakılır).

/**
 * Komisyon raporunda her eğitici için döndürülen tek kalem.
 * Normal satışlar (isTimed=false) komisyona tabi; canlı test satışları (isTimed=true) komisyonsuz.
 */
export interface CommissionReportItem {
  educatorId: string;
  username: string;
  email: string;
  iban: string | null;
  bankName: string | null;
  accountHolder: string | null;
  // Normal paket satışları — komisyon uygulanır
  normalSaleCount: number;
  normalSalesCents: number;
  commissionPercent: number;
  commissionCents: number;
  normalPayoutCents: number;
  // Canlı test satışları — komisyon uygulanmaz, tamamı eğiticiye ödenir
  liveSaleCount: number;
  liveSalesCents: number;
  // Tünel satışları — paket gibi komisyon uygulanır
  tunnelSaleCount: number;
  tunnelSalesCents: number;
  tunnelCommissionCents: number;
  tunnelPayoutCents: number;
  // Yazılı paket satışları — paket gibi komisyon uygulanır
  writtenSaleCount: number;
  writtenSalesCents: number;
  writtenCommissionCents: number;
  writtenPayoutCents: number;
  // Toplam (normal + canlı + tünel + yazılı)
  totalSaleCount: number;
  totalSalesCents: number;
  totalPayoutCents: number; // normalPayout + live + tunnelPayout + writtenPayout
}

/** Rapor döneminde geçerli olan oran aralığı */
export interface RateHistoryRange {
  commissionPercent: number;
  effectiveFrom: Date;
  effectiveTo: Date | null; // null → hâlâ geçerli
}

/**
 * Komisyon raporunun tamamını temsil eder.
 * Hem kalem bazlı hem de genel toplamları içerir.
 */
export interface CommissionReportResult {
  items: CommissionReportItem[];
  /** Mevcut (en güncel) komisyon oranı — geriye dönük uyumluluk */
  commissionPercent: number;
  /** Rapor döneminde geçerli olan oran aralıkları */
  rateHistory: RateHistoryRange[];
  year: number;
  month: number;
  totalNormalSalesCents: number;
  totalCommissionCents: number;
  totalNormalPayoutCents: number;
  totalLiveSalesCents: number;
  totalTunnelSalesCents: number;
  totalTunnelCommissionCents: number;
  totalTunnelPayoutCents: number;
  totalWrittenSalesCents: number;
  totalWrittenCommissionCents: number;
  totalWrittenPayoutCents: number;
  totalSalesCents: number;
  totalPayoutCents: number;
}

/**
 * Ham SQL sorgusu dönüş tipi — isTimed dahil GROUP BY sonucu.
 * bigint: Prisma $queryRawUnsafe COUNT/SUM sonuçlarını bigint döndürür.
 */
interface RawRow {
  educatorId: string;
  username: string;
  email: string;
  iban: string | null;
  bankName: string | null;
  accountHolder: string | null;
  isTimed: boolean;
  saleCount: bigint;
  totalSalesCents: bigint;
}

/**
 * GetCommissionReportUseCase — aylık eğitici komisyon raporunu üretir.
 *
 * İş kuralı:
 *   - isTimed=false (normal paket) → komisyon uygulanır
 *   - isTimed=true  (canlı test)   → komisyon uygulanmaz; tutarın tamamı eğiticiye ödenir
 *
 * Ön koşullar:
 *   - year: [2020, 2100] aralığında tam sayı
 *   - month: [1, 12] aralığında tam sayı
 *
 * Hata senaryoları:
 *   - Invalid year / Invalid month: sınır dışı değer girilirse Error fırlatılır
 */
export class GetCommissionReportUseCase {
  /**
   * Verilen tarihe göre geçerli komisyon oranını döndürür.
   * Tarihten önceki en son kaydı bulur; kayıt yoksa fallback oranı kullanılır.
   */
  private getRateAtDate(
    rateHistory: CommissionRateHistory[],
    purchaseDate: Date,
    fallback: number,
  ): number {
    // rateHistory effectiveFrom azalan sırada sıralı; ilk eşleşeni döndür
    const match = rateHistory.find((r) => r.effectiveFrom <= purchaseDate);
    return match ? match.commissionPercent : fallback;
  }

  /** Eğitici için boş rapor kalemi (normal + canlı + tünel sıfır). */
  private makeBlankItem(
    r: { educatorId: string; username: string; email: string; iban: string | null; bankName: string | null; accountHolder: string | null },
    commissionPercent: number,
  ): CommissionReportItem {
    return {
      educatorId: r.educatorId,
      username: r.username,
      email: r.email,
      iban: r.iban ?? null,
      bankName: r.bankName ?? null,
      accountHolder: r.accountHolder ?? null,
      normalSaleCount: 0,
      normalSalesCents: 0,
      commissionPercent,
      commissionCents: 0,
      normalPayoutCents: 0,
      liveSaleCount: 0,
      liveSalesCents: 0,
      tunnelSaleCount: 0,
      tunnelSalesCents: 0,
      tunnelCommissionCents: 0,
      tunnelPayoutCents: 0,
      writtenSaleCount: 0,
      writtenSalesCents: 0,
      writtenCommissionCents: 0,
      writtenPayoutCents: 0,
      totalSaleCount: 0,
      totalSalesCents: 0,
      totalPayoutCents: 0,
    };
  }

  async execute(year: number, month: number): Promise<CommissionReportResult> {
    // Yıl ve ay parametrelerini doğrula
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('Invalid year');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid month');

    // Admin raporlama — replica'dan oku (lag toleranslı).
    const readDb = prismaRead();

    // Admin ayarlarından mevcut komisyon yüzdesini oku; kayıt yoksa %20 varsayılan
    const settings = await readDb.adminSettings.findFirst({ where: { id: 1 } });
    const currentCommissionPercent = settings?.commissionPercent ?? 20;

    // Tüm oran geçmişini effectiveFrom azalan sırada getir
    const allHistory = await readDb.commissionRateHistory.findMany({
      orderBy: { effectiveFrom: 'desc' },
    });

    // Rapor döneminin başı ve sonu
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1); // exclusive

    // Rapor döneminde geçerli olan oran aralıkları
    const rateHistory: RateHistoryRange[] = allHistory
      .map((entry, idx) => ({
        commissionPercent: entry.commissionPercent,
        effectiveFrom: entry.effectiveFrom,
        effectiveTo: idx === 0 ? null : allHistory[idx - 1].effectiveFrom,
      }))
      .filter((range) => {
        // Aralık döneme tamamen sonradan başladıysa dahil etme
        if (range.effectiveFrom >= periodEnd) return false;
        // Aralık dönemden önce kapandıysa dahil etme
        if (range.effectiveTo !== null && range.effectiveTo <= periodStart) return false;
        return true;
      });

    // isTimed sütunu GROUP BY'a eklendi — aynı eğitici için iki satır gelebilir (normal + canlı)
    // Her satın alma için tarihi de çekiyoruz (oran hesabı için)
    interface RawRowWithDate extends RawRow {
      purchaseDate: Date;
    }

    const rows = await readDb.$queryRawUnsafe<RawRowWithDate[]>(`
      SELECT
        u.id               AS "educatorId",
        u.username,
        u.email,
        up.preferences->>'iban'           AS iban,
        up.preferences->>'bankName'       AS "bankName",
        up.preferences->>'accountHolder'  AS "accountHolder",
        et."isTimed",
        p."createdAt"                     AS "purchaseDate",
        COUNT(p.id)::bigint               AS "saleCount",
        COALESCE(SUM(p."amountCents"), 0)::bigint AS "totalSalesCents"
      FROM users u
      JOIN exam_tests et ON et."educatorId" = u.id
      JOIN purchases p   ON p."testId" = et.id
      LEFT JOIN user_preferences up ON up."userId" = u.id
      WHERE
        EXTRACT(YEAR  FROM p."createdAt") = ${year}
        AND EXTRACT(MONTH FROM p."createdAt") = ${month}
        AND p."deletedAt" IS NULL
        AND p.status = 'ACTIVE'
        AND u."deletedAt" IS NULL
      GROUP BY u.id, u.username, u.email, up.preferences, et."isTimed", p."createdAt"
      ORDER BY "totalSalesCents" DESC
    `);

    // Eğitici bazlı birleştirme: Map<educatorId, CommissionReportItem>
    // commissionPercent her satır için ayrı hesaplanır; eğiticinin toplam komisyonu biriktirilir
    const map = new Map<string, CommissionReportItem>();

    for (const r of rows) {
      const saleCount = Number(r.saleCount);
      const salesCents = Number(r.totalSalesCents);
      // Bu satın alma zamanındaki komisyon oranını bul
      const rateAtPurchase = this.getRateAtDate(allHistory, new Date(r.purchaseDate), currentCommissionPercent);

      if (!map.has(r.educatorId)) {
        map.set(r.educatorId, this.makeBlankItem(r, currentCommissionPercent));
      }

      const item = map.get(r.educatorId)!;

      if (r.isTimed) {
        // Canlı test satışı — komisyon uygulanmaz
        item.liveSaleCount += saleCount;
        item.liveSalesCents += salesCents;
      } else {
        // Normal paket satışı — komisyon, satın alma zamanındaki orana göre hesaplanır
        item.normalSaleCount += saleCount;
        item.normalSalesCents += salesCents;
        // commissionCents'i burada biriktirelim (satır bazlı doğru oran ile)
        item.commissionCents += Math.round((salesCents * rateAtPurchase) / 100);
      }
    }

    // ─── Tünel satışları (paket gibi komisyona tabi) ──────────────────────────
    interface TunnelRow {
      educatorId: string;
      username: string;
      email: string;
      iban: string | null;
      bankName: string | null;
      accountHolder: string | null;
      purchaseDate: Date;
      saleCount: bigint;
      totalSalesCents: bigint;
    }
    const tunnelRows = await readDb.$queryRawUnsafe<TunnelRow[]>(`
      SELECT
        u.id               AS "educatorId",
        u.username,
        u.email,
        up.preferences->>'iban'           AS iban,
        up.preferences->>'bankName'       AS "bankName",
        up.preferences->>'accountHolder'  AS "accountHolder",
        tp."createdAt"                    AS "purchaseDate",
        COUNT(tp.id)::bigint              AS "saleCount",
        COALESCE(SUM(tp."amountCents"), 0)::bigint AS "totalSalesCents"
      FROM users u
      JOIN tunnels t          ON t."educatorId" = u.id
      JOIN tunnel_purchases tp ON tp."tunnelId" = t.id
      LEFT JOIN user_preferences up ON up."userId" = u.id
      WHERE
        EXTRACT(YEAR  FROM tp."createdAt") = ${year}
        AND EXTRACT(MONTH FROM tp."createdAt") = ${month}
        AND tp.status = 'ACTIVE'
        AND u."deletedAt" IS NULL
      GROUP BY u.id, u.username, u.email, up.preferences, tp."createdAt"
    `);

    for (const r of tunnelRows) {
      const saleCount = Number(r.saleCount);
      const salesCents = Number(r.totalSalesCents);
      const rateAtPurchase = this.getRateAtDate(allHistory, new Date(r.purchaseDate), currentCommissionPercent);
      if (!map.has(r.educatorId)) {
        map.set(r.educatorId, this.makeBlankItem(r, currentCommissionPercent));
      }
      const item = map.get(r.educatorId)!;
      item.tunnelSaleCount += saleCount;
      item.tunnelSalesCents += salesCents;
      item.tunnelCommissionCents += Math.round((salesCents * rateAtPurchase) / 100);
    }

    // ─── Yazılı paket satışları (paket gibi komisyona tabi) ───────────────────
    // written_packages.educatorId SCALAR (User relation yok) → users ile id eşleşmesi.
    interface WrittenRow {
      educatorId: string;
      username: string;
      email: string;
      iban: string | null;
      bankName: string | null;
      accountHolder: string | null;
      purchaseDate: Date;
      saleCount: bigint;
      totalSalesCents: bigint;
    }
    const writtenRows = await readDb.$queryRawUnsafe<WrittenRow[]>(`
      SELECT
        u.id               AS "educatorId",
        u.username,
        u.email,
        up.preferences->>'iban'           AS iban,
        up.preferences->>'bankName'       AS "bankName",
        up.preferences->>'accountHolder'  AS "accountHolder",
        wp."createdAt"                    AS "purchaseDate",
        COUNT(wp.id)::bigint              AS "saleCount",
        COALESCE(SUM(wp."amountCents"), 0)::bigint AS "totalSalesCents"
      FROM users u
      JOIN written_packages wpk ON wpk."educatorId" = u.id
      JOIN written_purchases wp ON wp."packageId" = wpk.id
      LEFT JOIN user_preferences up ON up."userId" = u.id
      WHERE
        EXTRACT(YEAR  FROM wp."createdAt") = ${year}
        AND EXTRACT(MONTH FROM wp."createdAt") = ${month}
        AND wp.status = 'ACTIVE'
        AND u."deletedAt" IS NULL
      GROUP BY u.id, u.username, u.email, up.preferences, wp."createdAt"
    `);

    for (const r of writtenRows) {
      const saleCount = Number(r.saleCount);
      const salesCents = Number(r.totalSalesCents);
      const rateAtPurchase = this.getRateAtDate(allHistory, new Date(r.purchaseDate), currentCommissionPercent);
      if (!map.has(r.educatorId)) {
        map.set(r.educatorId, this.makeBlankItem(r, currentCommissionPercent));
      }
      const item = map.get(r.educatorId)!;
      item.writtenSaleCount += saleCount;
      item.writtenSalesCents += salesCents;
      item.writtenCommissionCents += Math.round((salesCents * rateAtPurchase) / 100);
    }

    // Toplam alanlarını hesapla; genel toplamları biriktir
    let sumNormalSales = 0;
    let sumCommission = 0;
    let sumNormalPayout = 0;
    let sumLiveSales = 0;
    let sumTunnelSales = 0;
    let sumTunnelCommission = 0;
    let sumTunnelPayout = 0;
    let sumWrittenSales = 0;
    let sumWrittenCommission = 0;
    let sumWrittenPayout = 0;

    const items: CommissionReportItem[] = [];

    for (const item of map.values()) {
      // normalPayoutCents = toplam normal satış - toplam komisyon (tarihsel oran dahil)
      item.normalPayoutCents = item.normalSalesCents - item.commissionCents;
      // tünelPayout = tünel satış - tünel komisyon
      item.tunnelPayoutCents = item.tunnelSalesCents - item.tunnelCommissionCents;
      // yazılıPayout = yazılı satış - yazılı komisyon
      item.writtenPayoutCents = item.writtenSalesCents - item.writtenCommissionCents;

      item.totalSaleCount = item.normalSaleCount + item.liveSaleCount + item.tunnelSaleCount + item.writtenSaleCount;
      item.totalSalesCents = item.normalSalesCents + item.liveSalesCents + item.tunnelSalesCents + item.writtenSalesCents;
      // Toplam ödeme: normal(komisyonlu) + canlı(komisyonsuz) + tünel(komisyonlu) + yazılı(komisyonlu)
      item.totalPayoutCents = item.normalPayoutCents + item.liveSalesCents + item.tunnelPayoutCents + item.writtenPayoutCents;

      sumNormalSales += item.normalSalesCents;
      sumCommission += item.commissionCents;
      sumNormalPayout += item.normalPayoutCents;
      sumLiveSales += item.liveSalesCents;
      sumTunnelSales += item.tunnelSalesCents;
      sumTunnelCommission += item.tunnelCommissionCents;
      sumTunnelPayout += item.tunnelPayoutCents;
      sumWrittenSales += item.writtenSalesCents;
      sumWrittenCommission += item.writtenCommissionCents;
      sumWrittenPayout += item.writtenPayoutCents;

      items.push(item);
    }

    // Toplam satış tutarına göre azalan sıralama
    items.sort((a, b) => b.totalSalesCents - a.totalSalesCents);

    return {
      items,
      commissionPercent: currentCommissionPercent,
      rateHistory,
      year,
      month,
      totalNormalSalesCents: sumNormalSales,
      totalCommissionCents: sumCommission,
      totalNormalPayoutCents: sumNormalPayout,
      totalLiveSalesCents: sumLiveSales,
      totalTunnelSalesCents: sumTunnelSales,
      totalTunnelCommissionCents: sumTunnelCommission,
      totalTunnelPayoutCents: sumTunnelPayout,
      totalWrittenSalesCents: sumWrittenSales,
      totalWrittenCommissionCents: sumWrittenCommission,
      totalWrittenPayoutCents: sumWrittenPayout,
      totalSalesCents: sumNormalSales + sumLiveSales + sumTunnelSales + sumWrittenSales,
      totalPayoutCents: sumNormalPayout + sumLiveSales + sumTunnelPayout + sumWrittenPayout,
    };
  }

  /**
   * CSV dışa aktarımı — Türkçe başlıklar + UTF-8 BOM (Excel uyumlu).
   * Kolon sırası: eğitici bilgileri → normal satış → komisyon → canlı test → toplam.
   */
  async exportCsv(year: number, month: number): Promise<string> {
    const report = await this.execute(year, month);
    // Dönem etiketi: YYYY-MM formatı
    const monthStr = String(month).padStart(2, '0');
    const period = `${year}-${monthStr}`;

    const headers = [
      'Eğitici',
      'E-posta',
      'IBAN',
      'Hesap Sahibi',
      'Banka',
      'Dönem',
      'Normal Satış Adedi',
      'Normal Satış (TL)',
      'Komisyon (%)',
      'Komisyon (TL)',
      'Normal Ödenecek (TL)',
      'Canlı Test Adedi',
      'Canlı Test Satış (TL)',
      'Canlı Test Ödenecek (TL)',
      'Tünel Adedi',
      'Tünel Satış (TL)',
      'Tünel Komisyon (TL)',
      'Tünel Ödenecek (TL)',
      'Yazılı Adedi',
      'Yazılı Satış (TL)',
      'Yazılı Komisyon (TL)',
      'Yazılı Ödenecek (TL)',
      'Toplam Ödenecek (TL)',
    ];

    // Değer içindeki çift tırnak karakterlerini kaçır (CSV standartı)
    const escape = (v: string | number | null) =>
      `"${String(v ?? '').replace(/"/g, '""')}"`;

    const dataRows = report.items.map((item) => [
      escape(item.username),
      escape(item.email),
      escape(item.iban),
      escape(item.accountHolder),
      escape(item.bankName),
      escape(period),
      escape(item.normalSaleCount),
      escape((item.normalSalesCents / 100).toFixed(2)),
      escape(report.commissionPercent),
      escape((item.commissionCents / 100).toFixed(2)),
      escape((item.normalPayoutCents / 100).toFixed(2)),
      escape(item.liveSaleCount),
      escape((item.liveSalesCents / 100).toFixed(2)),
      // Canlı test ödenecek = canlı satış tutarının tamamı (komisyon yok)
      escape((item.liveSalesCents / 100).toFixed(2)),
      escape(item.tunnelSaleCount),
      escape((item.tunnelSalesCents / 100).toFixed(2)),
      escape((item.tunnelCommissionCents / 100).toFixed(2)),
      escape((item.tunnelPayoutCents / 100).toFixed(2)),
      escape(item.writtenSaleCount),
      escape((item.writtenSalesCents / 100).toFixed(2)),
      escape((item.writtenCommissionCents / 100).toFixed(2)),
      escape((item.writtenPayoutCents / 100).toFixed(2)),
      escape((item.totalPayoutCents / 100).toFixed(2)),
    ]);

    // Özet satırı — tüm eğiticilerin toplamı
    dataRows.push([
      escape('TOPLAM'),
      escape(''),
      escape(''),
      escape(''),
      escape(''),
      escape(period),
      escape(report.items.reduce((s, i) => s + i.normalSaleCount, 0)),
      escape((report.totalNormalSalesCents / 100).toFixed(2)),
      escape(report.commissionPercent),
      escape((report.totalCommissionCents / 100).toFixed(2)),
      escape((report.totalNormalPayoutCents / 100).toFixed(2)),
      escape(report.items.reduce((s, i) => s + i.liveSaleCount, 0)),
      escape((report.totalLiveSalesCents / 100).toFixed(2)),
      escape((report.totalLiveSalesCents / 100).toFixed(2)),
      escape(report.items.reduce((s, i) => s + i.tunnelSaleCount, 0)),
      escape((report.totalTunnelSalesCents / 100).toFixed(2)),
      escape((report.totalTunnelCommissionCents / 100).toFixed(2)),
      escape((report.totalTunnelPayoutCents / 100).toFixed(2)),
      escape(report.items.reduce((s, i) => s + i.writtenSaleCount, 0)),
      escape((report.totalWrittenSalesCents / 100).toFixed(2)),
      escape((report.totalWrittenCommissionCents / 100).toFixed(2)),
      escape((report.totalWrittenPayoutCents / 100).toFixed(2)),
      escape((report.totalPayoutCents / 100).toFixed(2)),
    ]);

    const lines = [headers.map(escape).join(','), ...dataRows.map((r) => r.join(','))];
    // UTF-8 BOM: Excel'in Türkçe karakterleri doğru açması için
    return '﻿' + lines.join('\r\n');
  }
}
