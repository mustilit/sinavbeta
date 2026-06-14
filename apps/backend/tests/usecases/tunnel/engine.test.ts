/** Tünel adaptif motoru — saf yardımcı testleri (prisma yok). */
import {
  isMastered,
  withPosition,
  isPositionDone,
  correctCount,
  applyAnswer,
  pickNextPresentation,
  WINDOW_SIZE,
  REQUIRED_CORRECT,
  EngineQuestion,
} from '../../../src/application/use-cases/tunnel/engine';

describe('bit yardımcıları', () => {
  it('isMastered: en az REQUIRED_CORRECT (3) farklı pozisyon', () => {
    expect(REQUIRED_CORRECT).toBe(3);
    expect(isMastered(0b111)).toBe(true); // 3 pozisyon
    expect(isMastered(0b101)).toBe(false); // 2 pozisyon
    expect(isMastered(0b11101)).toBe(true); // 4 pozisyon
  });

  it('withPosition / isPositionDone / correctCount', () => {
    const m = withPosition(withPosition(0, 1), 3);
    expect(isPositionDone(m, 1)).toBe(true);
    expect(isPositionDone(m, 2)).toBe(false);
    expect(isPositionDone(m, 3)).toBe(true);
    expect(correctCount(m)).toBe(2);
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
  };

  it('taban doğru → streak artar; eşiğe ulaşınca üst açılır', () => {
    const s = applyAnswer({ ...base, streakCount: 2, correct: true });
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
    expect(s.newMask).toBe(0b10); // ustalık korunur (monoton)
  });

  it('üst katman sorusu yanlış → gerileme yok', () => {
    const s = applyAnswer({ ...base, questionLayerIndex: 2, baseLayer: 1, upperOpen: true, streakCount: 2, correct: false });
    expect(s.upperOpen).toBe(true);
    expect(s.streakCount).toBe(2);
  });

  it('ustalık: 3 FARKLI pozisyon doğru olunca öğrenilir (önce değil)', () => {
    // pozisyon 1 ve 3 doğru (2 pozisyon) → henüz değil
    const twoPos = withPosition(withPosition(0, 1), 3);
    const notYet = applyAnswer({ ...base, questionMask: twoPos, correctPosition: 1, correct: true });
    expect(notYet.mastered).toBe(false); // 1 zaten doluydu → hâlâ 2 pozisyon
    // farklı 3. pozisyon (2) doğru → öğrenildi
    const done = applyAnswer({ ...base, questionMask: twoPos, correctPosition: 2, correct: true });
    expect(correctCount(done.newMask)).toBe(3);
    expect(done.mastered).toBe(true);
  });
});

describe('pickNextPresentation — 5 seçeneklik pencere', () => {
  const q10: EngineQuestion = {
    id: 'q10',
    layerIndex: 1,
    optionIds: ['correct', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'],
    correctOptionId: 'correct',
  };

  it('10 seçenekli sorudan tam 5 seçenek sunar, doğru şık her zaman içeride', () => {
    const masks = new Map<string, number>();
    const r = pickNextPresentation({ questions: [q10], baseLayer: 1, upperOpen: false, masks }, () => 0);
    expect(r).not.toBeNull();
    expect(r!.order).toHaveLength(WINDOW_SIZE); // 5
    expect(r!.order.filter((id) => id === 'correct')).toHaveLength(1); // doğru tam 1 kez
    expect(r!.order[r!.correctPosition - 1]).toBe('correct'); // doğru, correctPosition'da
    const distinct = new Set(r!.order);
    expect(distinct.size).toBe(WINDOW_SIZE); // tekrar yok
  });

  it('farklı sunumlar farklı çeldirici/pozisyon üretebilir', () => {
    const masks = new Map<string, number>();
    // farklı rand dizileri → farklı seçim
    const seq1 = [0.1, 0.1, 0.9, 0.2, 0.7, 0.3, 0.5];
    const seq2 = [0.9, 0.8, 0.1, 0.6, 0.2, 0.4, 0.5];
    let i1 = 0, i2 = 0;
    const a = pickNextPresentation({ questions: [q10], baseLayer: 1, upperOpen: false, masks }, () => seq1[i1++ % seq1.length]);
    const b = pickNextPresentation({ questions: [q10], baseLayer: 1, upperOpen: false, masks }, () => seq2[i2++ % seq2.length]);
    // İkisinde de doğru var, 5'er seçenek
    expect(a!.order).toHaveLength(5);
    expect(b!.order).toHaveLength(5);
    // En az pozisyon veya çeldirici seti farklı olmalı
    const same = a!.correctPosition === b!.correctPosition && a!.order.join() === b!.order.join();
    expect(same).toBe(false);
  });

  it('3 seçenekli soruda pencere = 3 (toplamdan fazla seçenek istenmez)', () => {
    const q3: EngineQuestion = { id: 'q3', layerIndex: 1, optionIds: ['a', 'b', 'c'], correctOptionId: 'a' };
    const r = pickNextPresentation({ questions: [q3], baseLayer: 1, upperOpen: false, masks: new Map() }, () => 0);
    expect(r!.order).toHaveLength(3);
    expect(r!.order).toContain('a');
  });

  it('upperOpen → üst katman da havuzda; öğrenilen soru atlanır', () => {
    const qs: EngineQuestion[] = [
      { id: 'q1', layerIndex: 1, optionIds: ['a', 'b', 'c', 'd', 'e'], correctOptionId: 'a' },
      { id: 'q2', layerIndex: 2, optionIds: ['f', 'g', 'h', 'i', 'j'], correctOptionId: 'f' },
    ];
    const masks = new Map<string, number>([['q1', 0b111]]); // q1 öğrenildi (3 pozisyon)
    const r = pickNextPresentation({ questions: qs, baseLayer: 1, upperOpen: true, masks }, () => 0);
    expect(r!.questionId).toBe('q2');
  });

  it('tüm görünür sorular öğrenildiyse null', () => {
    const qs: EngineQuestion[] = [{ id: 'q1', layerIndex: 1, optionIds: ['a', 'b', 'c'], correctOptionId: 'a' }];
    const masks = new Map<string, number>([['q1', 0b111]]);
    const r = pickNextPresentation({ questions: qs, baseLayer: 1, upperOpen: false, masks }, () => 0);
    expect(r).toBeNull();
  });
});
