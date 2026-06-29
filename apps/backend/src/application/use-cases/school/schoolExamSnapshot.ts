/**
 * E-Sınıf — sınav teslim snapshot'ı.
 * Teslim (submit) anında sorular + seçenekler + doğru cevap + çözüm dondurulur.
 * Sonuç/inceleme/değerlendirme ekranları bu snapshot'tan render eder; eğitici
 * sınavı sonradan güncellese bile geçmiş teslimler çözüldüğü versiyonu gösterir.
 * Yeni çözmeler her zaman güncel (canlı) sınavı görür.
 */

export type SnapOption = { id: string; content: string; mediaUrl: string | null; isCorrect: boolean; order: number };
export type SnapQuestion = {
  id: string;
  content: string;
  mediaUrl: string | null;
  points: number;
  order: number;
  solutionText: string | null;
  solutionMediaUrl: string | null;
  options: SnapOption[];
};

type RawOption = { id: string; content?: string | null; mediaUrl?: string | null; isCorrect?: boolean | null; order?: number | null };
type RawQuestion = {
  id: string;
  content?: string | null;
  mediaUrl?: string | null;
  points?: number | null;
  order?: number | null;
  solutionText?: string | null;
  solutionMediaUrl?: string | null;
  options?: RawOption[];
};

/** Canlı exam.questions (+options) → dondurulmuş snapshot dizisi (order'a göre sıralı). */
export function buildExamSnapshot(questions: RawQuestion[]): SnapQuestion[] {
  return [...(questions ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((q) => ({
      id: q.id,
      content: q.content ?? '',
      mediaUrl: q.mediaUrl ?? null,
      points: q.points ?? 0,
      order: q.order ?? 0,
      solutionText: q.solutionText ?? null,
      solutionMediaUrl: q.solutionMediaUrl ?? null,
      options: [...(q.options ?? [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((o) => ({ id: o.id, content: o.content ?? '', mediaUrl: o.mediaUrl ?? null, isCorrect: !!o.isCorrect, order: o.order ?? 0 })),
    }));
}

/**
 * Sonuç/inceleme için soru kaynağını çöz: snapshot varsa onu (çözüldüğü versiyon),
 * yoksa canlı exam.questions (eski teslimler için geriye dönük uyum).
 */
export function resolveResultQuestions(snapshot: unknown, liveQuestions: RawQuestion[]): SnapQuestion[] {
  if (Array.isArray(snapshot) && snapshot.length) return snapshot as SnapQuestion[];
  return buildExamSnapshot(liveQuestions);
}
