/**
 * Tünel adaptif motoru — saf yardımcılar (prisma'sız, test edilebilir).
 *
 * Kurallar (kesinleşmiş):
 *  - Taban katman (baseLayer) = en alttaki henüz tam-öğrenilmemiş katman.
 *  - Görünür pencere: { baseLayer } ∪ ({ baseLayer+1 } eğer upperOpen). Maks 2 katman.
 *  - streakCount: taban katmanda üst üste doğru; advanceStreak'e ulaşınca üst katman açılır.
 *  - Alt (taban) katman sorusuna yanlış → üst kapanır + streak sıfırlanır (gerileme).
 *  - SUNUM: Her soru aynı anda WINDOW_SIZE (5) seçenekle gösterilir; DOĞRU ŞIK HER ZAMAN
 *    içindedir, kalan yuvalar havuzdaki (9) çeldiriciden rastgele seçilir → her sunumda
 *    farklı seçenekler. Doğru şıkkın yeri (pozisyon 1..5) de değişir.
 *  - USTALIK: Bir soru, doğru şık REQUIRED_CORRECT (≥3) FARKLI pozisyonda doğru
 *    cevaplanınca "öğrenildi". correctMask pozisyon bitlerini tutar; popcount ≥ 3 → ustalık.
 *    Yani her soru en az 3 kez (farklı seçenek/pozisyonla) doğru sorulmuş olur. Monoton.
 *  - Taban katman tam öğrenilince bir üst seviyeye kayar. Tüm katmanlar öğrenilince tünel biter.
 */

/** Aday'a aynı anda gösterilen seçenek sayısı (1 doğru + 4 çeldirici). */
export const WINDOW_SIZE = 5;
/** Ustalık için gereken farklı-pozisyon doğru sayısı (her soru en az bu kadar sorulur). */
export const REQUIRED_CORRECT = 3;

function popcount(n: number): number {
  let c = 0;
  let x = n;
  while (x) {
    c += x & 1;
    x >>>= 1;
  }
  return c;
}

export function isPositionDone(mask: number, position1: number): boolean {
  return (mask & (1 << (position1 - 1))) !== 0;
}

export function withPosition(mask: number, position1: number): number {
  return mask | (1 << (position1 - 1));
}

/** Doğru cevaplanan farklı pozisyon sayısı. */
export function correctCount(mask: number): number {
  return popcount(mask);
}

/** Soru öğrenildi mi: en az requiredCorrect farklı pozisyonda doğru. */
export function isMastered(mask: number, requiredCorrect: number = REQUIRED_CORRECT): boolean {
  return popcount(mask) >= requiredCorrect;
}

export type EngineQuestion = {
  id: string;
  layerIndex: number;
  optionIds: string[]; // kanonik sıradaki seçenek id'leri (1 doğru + N-1 çeldirici)
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

/** Bu soru için pencere boyutu (toplam seçenek 5'ten azsa hepsini göster). */
function windowFor(q: EngineQuestion): number {
  return Math.min(WINDOW_SIZE, q.optionIds.length);
}

/**
 * Sıradaki soruyu + sunumu seç. Görünür katmanlardaki ÖĞRENİLMEMİŞ sorulardan birini,
 * daha önce doğru cevaplanMAMIŞ bir pozisyonda (varsa) sunar. Pencere = doğru şık +
 * (WINDOW_SIZE-1) rastgele çeldirici; doğru şık her zaman içeride, yeri değişken.
 * @returns null → görünür katmanlarda öğrenilmemiş soru yok (taban ilerleyebilir / tünel bitebilir)
 */
export function pickNextPresentation(
  params: {
    questions: EngineQuestion[];
    baseLayer: number;
    upperOpen: boolean;
    masks: Map<string, number>; // questionId → correctMask
    requiredCorrect?: number;
    excludeQuestionId?: string | null; // az önce sorulan soru — başka soru varsa atlanır
  },
  rand: Rand = Math.random,
): { questionId: string; correctPosition: number; order: string[] } | null {
  const { questions, baseLayer, upperOpen, masks, excludeQuestionId } = params;
  const requiredCorrect = params.requiredCorrect ?? REQUIRED_CORRECT;
  const visible = new Set<number>([baseLayer]);
  if (upperOpen) visible.add(baseLayer + 1);

  let pool = questions.filter(
    (q) => visible.has(q.layerIndex) && !isMastered(masks.get(q.id) ?? 0, requiredCorrect),
  );
  if (pool.length === 0) return null;

  // Arka arkaya aynı soruyu sorma (seçenekler değişse bile):
  //  - Görünür havuzda başka soru varsa az önce sorulanı çıkar (round-robin).
  //  - Görünür havuz yalnız az önce sorulan soruya düştüyse (katman kuyruğu),
  //    tekrarı önlemek için DİĞER bir öğrenilmemiş soruyu (her katmandan) dolgu
  //    olarak getir. Tüm tünelde tek soru kaldıysa zorunlu olarak o sorulur.
  if (excludeQuestionId) {
    const withoutLast = pool.filter((q) => q.id !== excludeQuestionId);
    if (withoutLast.length > 0) {
      pool = withoutLast;
    } else {
      const fillerAnywhere = questions.filter(
        (q) => q.id !== excludeQuestionId && !isMastered(masks.get(q.id) ?? 0, requiredCorrect),
      );
      if (fillerAnywhere.length > 0) pool = fillerAnywhere;
    }
  }

  const q = pool[Math.floor(rand() * pool.length)];
  const mask = masks.get(q.id) ?? 0;
  const window = windowFor(q);

  // Henüz doğru cevaplanmamış pencere pozisyonlarını tercih et (farklı pozisyon → ustalık ilerler)
  const openPositions: number[] = [];
  for (let p = 1; p <= window; p++) if (!isPositionDone(mask, p)) openPositions.push(p);
  const positions = openPositions.length ? openPositions : Array.from({ length: window }, (_, i) => i + 1);
  const correctPosition = positions[Math.floor(rand() * positions.length)];

  // Çeldiriciler: havuzdan rastgele (window-1) tane → her sunumda farklı set
  const chosen = shuffle(q.optionIds.filter((id) => id !== q.correctOptionId), rand).slice(0, window - 1);
  const order: string[] = [];
  let di = 0;
  for (let p = 1; p <= window; p++) {
    order.push(p === correctPosition ? q.correctOptionId : chosen[di++]);
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
  requiredCorrect?: number;
}): {
  baseLayer: number;
  upperOpen: boolean;
  streakCount: number;
  newMask: number;
  mastered: boolean;
} {
  const { correct, questionLayerIndex, advanceStreak, layerCount } = params;
  const requiredCorrect = params.requiredCorrect ?? REQUIRED_CORRECT;
  let { baseLayer, upperOpen, streakCount, questionMask } = params;

  const isBaseQuestion = questionLayerIndex === baseLayer;

  // Ustalık (yalnız doğruda pozisyon biti set; monoton)
  let newMask = questionMask;
  if (correct) newMask = withPosition(questionMask, params.correctPosition);
  const mastered = isMastered(newMask, requiredCorrect);

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
