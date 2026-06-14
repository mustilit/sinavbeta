/**
 * Tünel adaptif motoru — saf yardımcılar (prisma'sız, test edilebilir).
 *
 * Kurallar (kesinleşmiş):
 *  - Taban katman (baseLayer) = en alttaki henüz tam-öğrenilmemiş katman.
 *  - Görünür pencere: { baseLayer } ∪ ({ baseLayer+1 } eğer upperOpen). Maks 2 katman.
 *  - streakCount: taban katmanda üst üste doğru; advanceStreak'e ulaşınca üst katman açılır.
 *  - Alt (taban) katman sorusuna yanlış → üst kapanır + streak sıfırlanır (gerileme).
 *  - Ustalık: her soru, doğru şıkkı optionsPerQuestion farklı pozisyonda doğru
 *    cevaplanınca "öğrenildi" (correctMask tüm bitler set). Ustalık monoton (bit silinmez).
 *  - Taban katman tam öğrenilince bir üst seviyeye kayar. Tüm katmanlar öğrenilince tünel biter.
 */

export function fullMask(optionsPerQuestion: number): number {
  return (1 << optionsPerQuestion) - 1;
}

export function isPositionDone(mask: number, position1: number): boolean {
  return (mask & (1 << (position1 - 1))) !== 0;
}

export function withPosition(mask: number, position1: number): number {
  return mask | (1 << (position1 - 1));
}

export function isMastered(mask: number, optionsPerQuestion: number): boolean {
  return mask === fullMask(optionsPerQuestion);
}

export type EngineQuestion = {
  id: string;
  layerIndex: number;
  optionIds: string[]; // kanonik sıradaki seçenek id'leri
  correctOptionId: string;
};

/** Deterministik olmayan karıştırma için index üreteci (test'te enjekte edilebilir). */
type Rand = () => number;

function shuffle<T>(arr: T[], rand: Rand): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sıradaki soruyu + sunumu seç. Görünür katmanlardaki ÖĞRENİLMEMİŞ sorulardan
 * birini, daha önce doğru cevaplanmamış bir pozisyonda sunar (her cevap ustalığı ilerletsin).
 * @returns null → görünür katmanlarda öğrenilmemiş soru yok (taban ilerleyebilir / tünel bitebilir)
 */
export function pickNextPresentation(
  params: {
    questions: EngineQuestion[];
    baseLayer: number;
    upperOpen: boolean;
    optionsPerQuestion: number;
    masks: Map<string, number>; // questionId → correctMask
  },
  rand: Rand = Math.random,
): { questionId: string; correctPosition: number; order: string[] } | null {
  const { questions, baseLayer, upperOpen, optionsPerQuestion, masks } = params;
  const visible = new Set<number>([baseLayer]);
  if (upperOpen) visible.add(baseLayer + 1);

  const pool = questions.filter(
    (q) => visible.has(q.layerIndex) && !isMastered(masks.get(q.id) ?? 0, optionsPerQuestion),
  );
  if (pool.length === 0) return null;

  const q = pool[Math.floor(rand() * pool.length)];
  const mask = masks.get(q.id) ?? 0;
  const openPositions: number[] = [];
  for (let p = 1; p <= optionsPerQuestion; p++) if (!isPositionDone(mask, p)) openPositions.push(p);
  const correctPosition = openPositions[Math.floor(rand() * openPositions.length)];

  // Sunum sırası: doğru şık correctPosition'a, çeldiriciler kalan yuvalara (karışık).
  const distractors = shuffle(q.optionIds.filter((id) => id !== q.correctOptionId), rand);
  const order: string[] = [];
  let di = 0;
  for (let p = 1; p <= optionsPerQuestion; p++) {
    order.push(p === correctPosition ? q.correctOptionId : distractors[di++]);
  }
  return { questionId: q.id, correctPosition, order };
}

/**
 * Bir cevabın motor durumuna etkisini hesaplar (saf). DB güncellemesi use-case'te.
 * @returns yeni durum alanları + soru ustalığı güncellemesi
 */
export function applyAnswer(params: {
  correct: boolean;
  questionLayerIndex: number;
  baseLayer: number;
  upperOpen: boolean;
  streakCount: number;
  advanceStreak: number;
  layerCount: number;
  questionMask: number;
  correctPosition: number;
  optionsPerQuestion: number;
}): {
  baseLayer: number;
  upperOpen: boolean;
  streakCount: number;
  newMask: number;
  mastered: boolean;
} {
  const { correct, questionLayerIndex, advanceStreak, layerCount, optionsPerQuestion } = params;
  let { baseLayer, upperOpen, streakCount, questionMask } = params;

  const isBaseQuestion = questionLayerIndex === baseLayer;

  // Ustalık (yalnız doğruda bit set; monoton)
  let newMask = questionMask;
  if (correct) newMask = withPosition(questionMask, params.correctPosition);
  const mastered = isMastered(newMask, optionsPerQuestion);

  if (correct) {
    if (isBaseQuestion) {
      streakCount += 1;
      if (!upperOpen && baseLayer < layerCount && streakCount >= advanceStreak) {
        upperOpen = true; // üst katman görünür olur
      }
    }
    // üst katman sorusu doğru → streak'i etkilemez (streak tabana özel)
  } else {
    if (isBaseQuestion) {
      // alt katman yanlış → üst kapanır + streak sıfır
      upperOpen = false;
      streakCount = 0;
    }
    // üst katman yanlış → gerileme yok (yalnız o sunum tekrar denenecek)
  }

  return { baseLayer, upperOpen, streakCount, newMask, mastered };
}
