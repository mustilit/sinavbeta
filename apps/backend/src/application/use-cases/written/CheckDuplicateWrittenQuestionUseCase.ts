import { prisma } from '../../../infrastructure/database/prisma';

function tokenize(text: string): Set<string> {
  return new Set(
    (text || '')
      .toLocaleLowerCase('tr')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const THRESHOLD = 0.75;
const MAX_SCAN = 2000;

export interface CheckDuplicateResult {
  isDuplicate: boolean;
  similarity: number;
  matchedQuestionId: string | null;
  matchedContent: string | null;
}

/**
 * Yazılı modülü kopya soru tespiti — eğiticinin YALNIZ yazılı soru havuzuyla
 * karşılaştırır (test/tünel ile karışmaz). Jaccard ≥ %75 → amber uyarı.
 */
export class CheckDuplicateWrittenQuestionUseCase {
  async execute(educatorId: string, content: string, excludeQuestionId?: string | null): Promise<CheckDuplicateResult> {
    const text = (content ?? '').trim();
    const empty: CheckDuplicateResult = { isDuplicate: false, similarity: 0, matchedQuestionId: null, matchedContent: null };
    if (!educatorId || text.length < 15) return empty;
    const target = tokenize(text);
    if (target.size === 0) return empty;

    const rows = await prisma.writtenQuestion.findMany({
      where: {
        test: { educatorId, deletedAt: null },
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
        if (sim >= 0.999) break;
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
