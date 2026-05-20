// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { prisma } from '../../../infrastructure/database/prisma';
import { Prisma } from '@prisma/client';

// ─── Ham SQL satır arayüzü ────────────────────────────────────────────────────

/**
 * Prisma $queryRaw sonucundan dönen ham satır tipi.
 * BigInt alanlar (COUNT), serileştirme öncesinde number'a çevrilir.
 */
interface RawAttemptRow {
  topicId: string;
  topicName: string;
  examTypeId: string;
  examTypeName: string;
  attemptId: string;
  /** Denemenin tamamlanma zamanı; SUBMITTED veya TIMEOUT yoksa null */
  completedAt: Date | null;
  totalQuestions: bigint;
  correct: bigint;
  wrong: bigint;
  blank: bigint;
  /** Süre aşımı (saniye); null = zamanında teslim veya süreli olmayan test */
  overtimeSeconds: number | null;
}

// ─── Dışa açık çıktı arayüzleri ──────────────────────────────────────────────

/**
 * Tek bir denemeye ait konu bazlı performans zaman noktası.
 * timeline dizisinde kronolojik sırayla yer alır.
 */
export interface TopicTimelinePoint {
  /** Deneme tamamlanma tarihi: YYYY-MM-DD formatında */
  date: string;
  correct: number;
  wrong: number;
  blank: number;
  total: number;
  /** Doğru / toplam * 100, 2 ondalık basamakla yuvarlanmış */
  pct: number;
  /** Süre aşımı saniyesi; null = zamanında teslim */
  overtimeSeconds: number | null;
}

/**
 * Konu + sınav türü çifti için toplu istatistik ve zaman serisi.
 */
export interface TopicGroup {
  topicId: string;
  topicName: string;
  examTypeId: string;
  examTypeName: string;
  totalAttempts: number;
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  totalBlank: number;
  /** Toplam başarı yüzdesi: totalCorrect / totalQuestions * 100 */
  overallPct: number;
  /**
   * Son iki deneme arasındaki pct farkı (1 ondalık).
   * Yalnızca bir deneme varsa null döner.
   */
  trend: number | null;
  timeline: TopicTimelinePoint[];
  /** Bu gruptaki denemelerden herhangi birinde süre aşımı olduysa true */
  hasOvertime: boolean;
  /** Gruba ait toplam süre aşımı sayısı */
  overtimeCount: number;
}

/**
 * GetTopicPerformanceUseCase execute() dönüş tipi.
 */
export interface TopicPerformanceResult {
  groups: TopicGroup[];
  /** Sorguda en az bir kez görünen sınav türleri (__none__ hariç) */
  examTypes: Array<{ id: string; name: string }>;
}

// ─── Use Case ─────────────────────────────────────────────────────────────────

/**
 * Aday için konu bazlı, zamana bağlı performans raporu hesaplar.
 *
 * Ön koşullar:
 *   - candidateId geçerli bir kullanıcı ID'si olmalıdır.
 *   - Yalnızca SUBMITTED ve TIMEOUT durumdaki denemeler dahil edilir.
 *
 * Hata senaryoları:
 *   - candidateId falsy ise boş sonuç döner (HTTP katmanında guard korumalıdır).
 *
 * Güvenlik:
 *   - SQL injection'a karşı $queryRaw tagged template literal kullanılır;
 *     $queryRawUnsafe hiçbir durumda kullanılmaz.
 */
@Injectable()
export class GetTopicPerformanceUseCase {
  /**
   * Belirtilen aday için konu + sınav türü çiftlerine göre gruplandırılmış
   * performans verisini ve zaman serisini hesaplar.
   *
   * @param candidateId - Performansı sorgulanacak adayın kullanıcı ID'si
   * @returns Gruplandırılmış istatistikler ve benzersiz sınav türleri listesi
   */
  async execute(candidateId: string): Promise<TopicPerformanceResult> {
    // candidateId yoksa (guard atlandıysa) güvenli boş sonuç döndür
    if (!candidateId) {
      return { groups: [], examTypes: [] };
    }

    // Ham SQL sorgusu: attempt başına (topicId, examTypeId) grubu
    // $queryRaw tagged template literal → parametreler Prisma tarafından güvenle escape edilir
    const rows = await prisma.$queryRaw<RawAttemptRow[]>(
      Prisma.sql`
        SELECT
          COALESCE(t.id, '__none__')                AS "topicId",
          COALESCE(t.name, 'Konu Belirtilmemiş')    AS "topicName",
          COALESCE(et."examTypeId", '__none__')      AS "examTypeId",
          COALESCE(eta.name, 'Türsüz')              AS "examTypeName",
          ta.id                                      AS "attemptId",
          COALESCE(ta."submittedAt", ta."finishedAt", ta."completedAt") AS "completedAt",
          ta."overtimeSeconds"                       AS "overtimeSeconds",
          COUNT(aa.id)::bigint                       AS "totalQuestions",
          COUNT(aa.id) FILTER (
            WHERE aa."selectedOptionId" IS NOT NULL AND eo."isCorrect" = true
          )::bigint                                  AS "correct",
          COUNT(aa.id) FILTER (
            WHERE aa."selectedOptionId" IS NOT NULL
              AND (eo."isCorrect" = false OR eo."isCorrect" IS NULL)
          )::bigint                                  AS "wrong",
          COUNT(aa.id) FILTER (
            WHERE aa."selectedOptionId" IS NULL
          )::bigint                                  AS "blank"
        FROM test_attempts ta
        JOIN exam_tests et ON et.id = ta."testId"
        LEFT JOIN topics t ON t.id = et."topicId"
        LEFT JOIN exam_types eta ON eta.id = et."examTypeId"
        JOIN attempt_answers aa ON aa."attemptId" = ta.id
        LEFT JOIN exam_options eo ON eo.id = aa."selectedOptionId"
        WHERE
          ta."candidateId" = ${candidateId}
          AND ta.status IN ('SUBMITTED', 'TIMEOUT')
        GROUP BY
          t.id, t.name, et."examTypeId", eta.name, ta.id,
          COALESCE(ta."submittedAt", ta."finishedAt", ta."completedAt")
        ORDER BY t.name ASC, "completedAt" ASC
      `,
    );

    // ─── Aggregation: satırları (topicId___examTypeId) anahtarıyla grupla ───

    // Map key: topicId + '___' + examTypeId — çakışmayı önleyen ayırıcı
    const groupMap = new Map<string, TopicGroup>();

    // Benzersiz sınav türlerini toplamak için ara map
    const examTypeMap = new Map<string, string>(); // id → name

    for (const row of rows) {
      const key = `${row.topicId}___${row.examTypeId}`;

      // BigInt → number dönüşümü (JS'de BigInt JSON serialize edilemez)
      const total = Number(row.totalQuestions);
      const correct = Number(row.correct);
      const wrong = Number(row.wrong);
      const blank = Number(row.blank);

      // Mevcut grubu al ya da yeni oluştur
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          topicId: row.topicId,
          topicName: row.topicName,
          examTypeId: row.examTypeId,
          examTypeName: row.examTypeName,
          totalAttempts: 0,
          totalQuestions: 0,
          totalCorrect: 0,
          totalWrong: 0,
          totalBlank: 0,
          overallPct: 0,
          trend: null,
          timeline: [],
          hasOvertime: false,
          overtimeCount: 0,
        });
      }

      const group = groupMap.get(key)!;
      group.totalAttempts += 1;
      group.totalQuestions += total;
      group.totalCorrect += correct;
      group.totalWrong += wrong;
      group.totalBlank += blank;

      // Süre aşımı sayacını güncelle
      const overtime = row.overtimeSeconds != null ? Number(row.overtimeSeconds) : null;
      if (overtime !== null && overtime > 0) {
        group.hasOvertime   = true;
        group.overtimeCount += 1;
      }

      // completedAt varsa zaman serisi noktası ekle
      if (row.completedAt) {
        const pct =
          total > 0
            ? Math.round((correct / total) * 100 * 100) / 100 // 2 ondalık
            : 0;

        group.timeline.push({
          // ISO tarih dizisinin yalnızca YYYY-MM-DD kısmını al
          date: new Date(row.completedAt).toISOString().slice(0, 10),
          correct,
          wrong,
          blank,
          total,
          pct,
          overtimeSeconds: overtime,
        });
      }

      // __none__ ID'si taşıyan sınav türlerini examTypes listesine ekleme
      if (row.examTypeId !== '__none__') {
        examTypeMap.set(row.examTypeId, row.examTypeName);
      }
    }

    // ─── Grup sonrası hesaplamalar ────────────────────────────────────────────

    const groups = Array.from(groupMap.values()).map((group) => {
      // Genel başarı yüzdesi
      group.overallPct =
        group.totalQuestions > 0
          ? Math.round((group.totalCorrect / group.totalQuestions) * 100 * 100) / 100
          : 0;

      // Trend: son iki timeline noktası arasındaki pct farkı (1 ondalık)
      if (group.timeline.length >= 2) {
        const last = group.timeline[group.timeline.length - 1].pct;
        const prev = group.timeline[group.timeline.length - 2].pct;
        group.trend = Math.round((last - prev) * 10) / 10;
      }

      return group;
    });

    // ─── Sıralama: examTypeName → topicName (Türkçe locale) ──────────────────
    groups.sort((a, b) => {
      const examTypeCmp = a.examTypeName.localeCompare(b.examTypeName, 'tr');
      if (examTypeCmp !== 0) return examTypeCmp;
      return a.topicName.localeCompare(b.topicName, 'tr');
    });

    // Sınav türleri listesi — Map'ten türet, id sırasına göre sırala
    const examTypes = Array.from(examTypeMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));

    return { groups, examTypes };
  }
}
