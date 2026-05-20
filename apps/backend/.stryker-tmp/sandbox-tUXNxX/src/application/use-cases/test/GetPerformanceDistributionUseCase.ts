// @ts-nocheck
import { IAttemptRepository } from '../../../domain/interfaces/IAttemptRepository';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { RedisCache } from '../../../infrastructure/cache/RedisCache';

/** Tek bir testin performans dağılımı raporu için dönüş tipi */
type Result = {
  testId: string;
  totalParticipants?: number;
  maxScore?: number;
  /** Ortalama, medyan, çeyrekler */
  stats?: { average: number; median: number; p25: number; p75: number };
  /** Her skor değeri için katılımcı sayısı — histogram bar chart için */
  histogram?: Array<{ score: number; count: number }>;
  /** İstek yapan adayın kendi skoru ve yüzdelik dilimi */
  my?: { score: number; percentile: number };
  message?: string;
};

/**
 * Bir test için skor dağılım histogramı ve istatistikleri hesaplar.
 * Adayın kendi skorunu kalabalığa göre yüzdelik dilimde konumlandırır.
 *
 * Performans:
 *   - Histogram sonuçları Redis'e 10dk cache'lenir
 *   - En az 5 katılımcı olmadan istatistik dönmez (anlamlı veri eşiği)
 */
export class GetPerformanceDistributionUseCase {
  private cache: RedisCache;
  constructor(private readonly attemptRepo: IAttemptRepository) {
    this.cache = new RedisCache();
  }

  async execute(testId: string, candidateId: string, attemptId?: string): Promise<Result> {
    if (!testId || !candidateId) throw new BadRequestException('INVALID_INPUT');

    // Maksimum skor = soru sayısı; önce stored count, yoksa sayım
    const test = await prisma.examTest.findUnique({ where: { id: testId }, select: { questionCount: true } });
    let maxScore = test?.questionCount ?? null;
    if (maxScore === null) {
      const qCount = await prisma.examQuestion.count({ where: { testId } });
      maxScore = qCount;
    }
    if (maxScore === null) maxScore = 0;

    const total = await this.attemptRepo.countSubmittedByTest(testId);
    // 5'ten az katılımcıyla histogram anlamlı değil
    if (total < 5) {
      return { testId, totalParticipants: total, message: 'Not enough data' };
    }
    const cacheKey = `perfdist:${testId}:v1`;
    let cached: any = null;
    try {
      cached = await this.cache.get(cacheKey);
    } catch {}
    // Cache geçerliyse (aynı maxScore ve katılımcı sayısı) histogram verisini yeniden kullan
    let groups = null;
    if (cached && cached.maxScore === maxScore && cached.totalParticipants === total) {
      groups = cached.histogram;
    } else {
      groups = await this.attemptRepo.groupScoresByTest(testId);
    }
    // 0'dan maxScore'a kadar tüm skor dilimleri için tam histogram oluştur
    const map = new Map<number, number>();
    for (const g of groups) {
      const s = Number(g.score);
      if (isNaN(s)) continue;
      // Beklenen aralık dışı skor — veri tutarsızlığı; uyar ve atla
      if (s < 0 || s > maxScore) {
        console.warn(`Ignoring out-of-range score for test ${testId}: ${s}`);
        continue;
      }
      map.set(s, (map.get(s) ?? 0) + Number(g.count));
    }
    const histogram: Array<{ score: number; count: number }> = [];
    let sum = 0;
    // Tüm aralığı doldur (0 katılımcılı skorlar da dahil — grafik boşluk bırakmasın)
    for (let s = 0; s <= maxScore; s++) {
      const c = map.get(s) ?? 0;
      histogram.push({ score: s, count: c });
      sum += s * c;
    }
    const totalCount = histogram.reduce((acc, b) => acc + b.count, 0);
    const average = totalCount ? sum / totalCount : 0;

    // Kümülatif dizi üzerinden yüzdelik hesabı
    const cumulative: Array<{ score: number; cum: number }> = [];
    let cum = 0;
    for (const b of histogram) {
      cum += b.count;
      cumulative.push({ score: b.score, cum });
    }
    const percentileFor = (score: number) => {
      const lessEqual = cumulative.filter((c) => c.score <= score).reduce((a, b) => Math.max(a, b.cum), 0);
      const p = totalCount ? (lessEqual / totalCount) * 100 : 0;
      if (p < 0) return 0;
      if (p > 100) return 100;
      return p;
    };

    const median = this.percentileFromHistogram(cumulative, totalCount, 50);
    const p25 = this.percentileFromHistogram(cumulative, totalCount, 25);
    const p75 = this.percentileFromHistogram(cumulative, totalCount, 75);

    // Adayın kendi skoru: belirli deneme veya en son tamamlanan deneme
    let myScore = 0;
    if (attemptId) {
      const att = await this.attemptRepo.findAttemptById(attemptId);
      if (!att) throw new BadRequestException('ATTEMPT_NOT_FOUND');
      if (att.candidateId !== candidateId) throw new ForbiddenException('NOT_ATTEMPT_OWNER');
      myScore = att.score ?? 0;
    } else {
      const latest = await this.attemptRepo.findLatestSubmittedAttempt(testId, candidateId);
      if (!latest) throw new BadRequestException('NO_SUBMITTED_ATTEMPT');
      myScore = latest.score ?? 0;
    }
    const myPercentile = percentileFor(myScore);

    const result = {
      testId,
      totalParticipants: totalCount,
      maxScore,
      stats: { average, median, p25, p75 },
      histogram,
    };

    // Global histogram kısmını cache'le (600sn = 10dk); kişisel skor hariç tutulur
    try {
      await this.cache.set(cacheKey, { histogram, stats: result.stats, totalParticipants: totalCount, maxScore }, 600);
    } catch {}

    return { ...result, my: { score: myScore, percentile: myPercentile } };
  }

  /**
   * Kümülatif histogram üzerinden belirli bir yüzdelik dilim değerini (skor) döner.
   * @param pct - Hedef yüzdelik (örn. 50 → medyan, 25 → alt çeyrek)
   */
  private percentileFromHistogram(cumulative: Array<{ score: number; cum: number }>, total: number, pct: number) {
    if (!total) return 0;
    const target = (pct / 100) * total;
    for (const c of cumulative) {
      if (c.cum >= target) return c.score;
    }
    return cumulative.length ? cumulative[cumulative.length - 1].score : 0;
  }
}

