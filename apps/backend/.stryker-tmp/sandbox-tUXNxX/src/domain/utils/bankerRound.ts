/**
 * Banker rounding (round half to even) — finansal hesaplarda standart.
 * .5'leri en yakın çift sayıya yuvarlar; uzun vadede bias'sız.
 *
 * Math.round bias yapar (her zaman yukarı); finansal hesaplar için sakıncalı.
 */
// @ts-nocheck

export function bankerRound(value: number): number {
  const rounded = Math.round(value);
  // Eğer tam .5'lik bir değer mi (epsilon ile)?
  const diff = Math.abs(value - Math.trunc(value));
  if (Math.abs(diff - 0.5) < 1e-9) {
    const truncated = Math.trunc(value);
    return truncated % 2 === 0 ? truncated : truncated + Math.sign(value);
  }
  return rounded;
}
