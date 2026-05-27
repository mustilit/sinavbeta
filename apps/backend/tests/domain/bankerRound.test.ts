/**
 * bankerRound (Banker's rounding / Round Half to Even) testleri
 *
 * Doğrulanan davranışlar:
 * - .5'lerin en yakın çift sayıya yuvarlanması (bias'sız)
 * - Normal yuvarlama (< .5 aşağı, > .5 yukarı)
 * - Negatif sayılar
 * - Sıfır
 * - Büyük sayılar
 */

import { bankerRound } from '../../src/domain/utils/bankerRound';

describe('bankerRound', () => {
  // Normal yuvarlama (Math.round ile aynı sonuç)
  it('0.4 → 0 (aşağı yuvarlar)', () => {
    expect(bankerRound(0.4)).toBe(0);
  });

  it('0.6 → 1 (yukarı yuvarlar)', () => {
    expect(bankerRound(0.6)).toBe(1);
  });

  it('2.4 → 2 (aşağı yuvarlar)', () => {
    expect(bankerRound(2.4)).toBe(2);
  });

  it('2.6 → 3 (yukarı yuvarlar)', () => {
    expect(bankerRound(2.6)).toBe(3);
  });

  // Tam .5 — Banker rounding devreye girer
  it('0.5 → 0 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(0.5)).toBe(0);
  });

  it('1.5 → 2 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(1.5)).toBe(2);
  });

  it('2.5 → 2 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(2.5)).toBe(2);
  });

  it('3.5 → 4 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(3.5)).toBe(4);
  });

  it('4.5 → 4 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(4.5)).toBe(4);
  });

  it('5.5 → 6 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(5.5)).toBe(6);
  });

  // Negatif sayılar
  it('-0.5 → 0 (çift sayıya yuvarlar)', () => {
    // Banker rounding -0.5 için 0'a yuvarlar; ancak Math.round/floor + adjust
    // negatif input için -0 dönebilir. IEEE 754'te -0 === 0 (sayısal eşit),
    // Object.is ve jest'in toEqual ayırt eder. Bu yüzden numeric karşılaştırma:
    const result = bankerRound(-0.5);
    expect(result === 0).toBe(true);
  });

  it('-1.5 → -2 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(-1.5)).toBe(-2);
  });

  it('-2.5 → -2 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(-2.5)).toBe(-2);
  });

  // Tam sayılar
  it('tam sayılar değişmez', () => {
    expect(bankerRound(5)).toBe(5);
    expect(bankerRound(0)).toBe(0);
    expect(bankerRound(-3)).toBe(-3);
  });

  // Büyük sayılar
  it('1000.5 → 1000 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(1000.5)).toBe(1000);
  });

  it('1001.5 → 1002 (çift sayıya yuvarlar)', () => {
    expect(bankerRound(1001.5)).toBe(1002);
  });
});
