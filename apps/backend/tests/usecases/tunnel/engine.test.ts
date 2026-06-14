/** Tünel adaptif motoru — saf yardımcı testleri (prisma yok). */
import {
  fullMask,
  isMastered,
  withPosition,
  isPositionDone,
  applyAnswer,
  pickNextPresentation,
  EngineQuestion,
} from '../../../src/application/use-cases/tunnel/engine';

describe('bit yardımcıları', () => {
  it('fullMask / isMastered / withPosition', () => {
    expect(fullMask(3)).toBe(0b111);
    expect(isMastered(0b111, 3)).toBe(true);
    expect(isMastered(0b101, 3)).toBe(false);
    const m = withPosition(withPosition(0, 1), 3);
    expect(isPositionDone(m, 1)).toBe(true);
    expect(isPositionDone(m, 2)).toBe(false);
    expect(isPositionDone(m, 3)).toBe(true);
  });
});

describe('applyAnswer', () => {
  const base = {
    questionLayerIndex: 1,
    baseLayer: 1,
    upperOpen: false,
    streakCount: 0,
    advanceStreak: 3,
    layerCount: 5,
    questionMask: 0,
    correctPosition: 2,
    optionsPerQuestion: 10,
  };

  it('taban doğru → streak artar; eşiğe ulaşınca üst açılır', () => {
    let s = applyAnswer({ ...base, streakCount: 2, correct: true });
    expect(s.streakCount).toBe(3);
    expect(s.upperOpen).toBe(true);
    expect(isPositionDone(s.newMask, 2)).toBe(true);
  });

  it('taban doğru ama eşik altı → üst kapalı', () => {
    const s = applyAnswer({ ...base, streakCount: 0, correct: true });
    expect(s.streakCount).toBe(1);
    expect(s.upperOpen).toBe(false);
  });

  it('alt katman yanlış (üst açıkken) → üst kapanır + streak sıfır + mask korunur', () => {
    const s = applyAnswer({ ...base, upperOpen: true, streakCount: 2, questionMask: 0b10, correct: false });
    expect(s.upperOpen).toBe(false);
    expect(s.streakCount).toBe(0);
    expect(s.newMask).toBe(0b10); // ustalık korunur
  });

  it('üst katman sorusu yanlış → gerileme yok', () => {
    const s = applyAnswer({ ...base, questionLayerIndex: 2, baseLayer: 1, upperOpen: true, streakCount: 2, correct: false });
    expect(s.upperOpen).toBe(true);
    expect(s.streakCount).toBe(2);
  });

  it('son pozisyon doğru → mastered', () => {
    const almost = fullMask(10) & ~(1 << 1); // pozisyon 2 hariç hepsi
    const s = applyAnswer({ ...base, questionMask: almost, correctPosition: 2, correct: true });
    expect(s.mastered).toBe(true);
  });
});

describe('pickNextPresentation', () => {
  const qs: EngineQuestion[] = [
    { id: 'q1', layerIndex: 1, optionIds: ['a', 'b', 'c'], correctOptionId: 'a' },
    { id: 'q2', layerIndex: 2, optionIds: ['d', 'e', 'f'], correctOptionId: 'e' },
  ];

  it('yalnız görünür katmandan, açılmamış pozisyonda sunar; doğru şık doğru yuvada', () => {
    const masks = new Map<string, number>();
    const r = pickNextPresentation(
      { questions: qs, baseLayer: 1, upperOpen: false, optionsPerQuestion: 3, masks },
      () => 0,
    );
    expect(r).not.toBeNull();
    expect(r!.questionId).toBe('q1'); // upper kapalı → yalnız katman 1
    expect(r!.order).toHaveLength(3);
    expect(r!.order[r!.correctPosition - 1]).toBe('a'); // doğru şık correctPosition'da
  });

  it('upperOpen → üst katman soruları da havuzda', () => {
    const masks = new Map<string, number>([['q1', fullMask(3)]]); // q1 öğrenildi
    const r = pickNextPresentation(
      { questions: qs, baseLayer: 1, upperOpen: true, optionsPerQuestion: 3, masks },
      () => 0,
    );
    expect(r!.questionId).toBe('q2'); // q1 mastered → q2 (üst) seçilir
  });

  it('tüm görünür sorular öğrenildiyse null', () => {
    const masks = new Map<string, number>([['q1', fullMask(3)]]);
    const r = pickNextPresentation(
      { questions: qs, baseLayer: 1, upperOpen: false, optionsPerQuestion: 3, masks },
      () => 0,
    );
    expect(r).toBeNull();
  });
});
