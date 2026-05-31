import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Türkçe-duyarlı tokenizasyon: küçük harf (tr), noktalama → boşluk, 2+ harfli token'lar.
 * Jaccard benzerliği için kelime kümesi üretir.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    (text || '')
      .toLocaleLowerCase('tr')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

/** Jaccard benzerliği: |A ∩ B| / |A ∪ B| (0–1). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const THRESHOLD = 0.75; // KALITE: %75 üzeri benzerlikte amber uyarı (domain kuralı)
const MAX_SCAN = 2000; // makul üst sınır — blur kontrolü hot-path

export interface CheckDuplicateResult {
  isDuplicate: boolean;
  similarity: number;
  matchedQuestionId: string | null;
  matchedContent: string | null;
}

/**
 * Kopya soru tespiti — eğitici soru girerken (blur) çağrılır.
 *
 * Eğiticinin SORU HAVUZUNUN TAMAMIYLA karşılaştırır:
 *  - Yayım durumu fark etmez (taslak/yayımlı paket dahil),
 *  - Hangi pakette olduğu fark etmez (eski/yeni tüm testleri),
 *  - excludeQuestionId verilirse o soru hariç (düzenleme akışında kendisiyle eşleşmesin).
 *
 * En yüksek Jaccard benzerliği >= %75 ise isDuplicate=true döner; frontend amber uyarı gösterir.
 */
export class CheckDuplicateQuestionUseCase {
  async execute(
    educatorId: string,
    content: string,
    excludeQuestionId?: string | null,
  ): Promise<CheckDuplicateResult> {
    const text = (content ?? '').trim();
    const empty: CheckDuplicateResult = {
      isDuplicate: false,
      similarity: 0,
      matchedQuestionId: null,
      matchedContent: null,
    };
    // Çok kısa metin veya kimliksiz istek → karşılaştırma yapma.
    if (!educatorId || text.length < 15) return empty;

    const target = tokenize(text);
    if (target.size === 0) return empty;

    // Eğiticinin tüm soruları (ExamQuestion → test.educatorId). Yayım durumu/paket fark etmez.
    const rows = await prisma.examQuestion.findMany({
      where: {
        test: { educatorId },
        ...(excludeQuestionId ? { id: { not: excludeQuestionId } } : {}),
      },
      select: { id: true, content: true },
      take: MAX_SCAN,
      orderBy: { createdAt: 'desc' },
    });

    let best = { similarity: 0, questionId: null as string | null, content: '' };
    for (const r of rows) {
      if (!r.content) continue;
      const sim = jaccard(target, tokenize(r.content));
      if (sim > best.similarity) {
        best = { similarity: sim, questionId: r.id, content: r.content };
        if (sim >= 0.999) break; // birebir eşleşme — daha iyisi olamaz
      }
    }

    return {
      isDuplicate: best.similarity >= THRESHOLD,
      similarity: Number(best.similarity.toFixed(4)),
      matchedQuestionId: best.questionId,
      matchedContent: best.content ? best.content.substring(0, 200) : null,
    };
  }
}
