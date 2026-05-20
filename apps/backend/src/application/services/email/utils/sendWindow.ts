/**
 * Gönderim saat penceresi (quiet hours) hesaplaması.
 *
 * Pencere [startHour, endHour) — startHour dahil, endHour dahil değil.
 * `startHour < endHour` zorunlu (gece bölünmüş pencere şu an desteklenmiyor;
 * 24h saat formatında 0-23 arası start, 1-24 arası end kabul edilir).
 *
 * Timezone IANA formatı (örn "Europe/Istanbul"). Hatalı TZ → UTC fallback.
 */

export type SendWindowConfig = {
  enabled: boolean;
  startHour: number;       // 0..23
  endHour: number;         // 1..24
  timezone: string;        // IANA
};

export type WindowDecision =
  | { inWindow: true; delayMs: 0 }
  | { inWindow: false; delayMs: number; nextOpensAt: Date };

/**
 * Verilen zamanda pencerenin durumunu döner.
 * - Pencere açık → delayMs = 0
 * - Pencere kapalı → delayMs > 0 (kaç ms sonra pencere açılır), nextOpensAt
 */
export function evaluateWindow(now: Date, cfg: SendWindowConfig): WindowDecision {
  if (!cfg.enabled) return { inWindow: true, delayMs: 0 };
  if (!isValidWindow(cfg)) return { inWindow: true, delayMs: 0 };

  const tz = cfg.timezone || 'UTC';
  const parts = getZonedParts(now, tz);
  const hour = parts.hour;

  if (hour >= cfg.startHour && hour < cfg.endHour) {
    return { inWindow: true, delayMs: 0 };
  }

  const nextOpensAt = computeNextOpen(now, parts, cfg);
  const delayMs = Math.max(0, nextOpensAt.getTime() - now.getTime());
  return { inWindow: false, delayMs, nextOpensAt };
}

export function isValidWindow(cfg: SendWindowConfig): boolean {
  return (
    Number.isInteger(cfg.startHour) &&
    Number.isInteger(cfg.endHour) &&
    cfg.startHour >= 0 &&
    cfg.startHour <= 23 &&
    cfg.endHour >= 1 &&
    cfg.endHour <= 24 &&
    cfg.startHour < cfg.endHour
  );
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    let h = get('hour');
    if (h === 24) h = 0; // bazı runtime'lar 24 döner gece yarısı
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: h,
      minute: get('minute'),
      second: get('second'),
    };
  } catch {
    // Hatalı TZ → UTC fallback
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }
}

/**
 * Sonraki pencere açılışının UTC zamanını hesaplar.
 * - hour < startHour → bugün startHour'da açılır
 * - hour >= endHour  → yarın startHour'da açılır
 */
function computeNextOpen(now: Date, parts: ZonedParts, cfg: SendWindowConfig): Date {
  const sameDay = parts.hour < cfg.startHour;
  // Hedef yerel zaman: <Y>-<M>-<D> <startHour>:00:00 (zone'a göre)
  const dayShift = sameDay ? 0 : 1;
  const target = makeZonedDate(parts, cfg.timezone, cfg.startHour, dayShift);
  // Güvenlik: hedef şu andan daha eskiyse 1 gün ileri al
  if (target.getTime() <= now.getTime()) {
    return new Date(target.getTime() + 24 * 60 * 60 * 1000);
  }
  return target;
}

/**
 * Verilen zonal Y/M/D ve `targetHour` için UTC bir Date üretir.
 * dayShift > 0 ise tarih ileri kaydırılır. TZ offsetini sahteleyerek hesaplar.
 */
function makeZonedDate(parts: ZonedParts, timeZone: string, targetHour: number, dayShift: number): Date {
  // Yerel zonda hedef ay/gün/saat string'i kur, sonra TZ offsetini çıkararak UTC ms hesapla.
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayShift, targetHour, 0, 0));
  // base şu an UTC olarak ele alınıyor — gerçek hedef yerel zonda bu saatte
  // base'in yerel zon karşılığını bulmak için: yerel zonda gözüken hour ile UTC hour farkını kullan.
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const out = fmt.formatToParts(base);
    const get = (t: string) => Number(out.find((p) => p.type === t)?.value);
    let zonedHour = get('hour');
    if (zonedHour === 24) zonedHour = 0;
    const zonedYear = get('year');
    const zonedMonth = get('month');
    const zonedDay = get('day');
    // base'in yerel zonda gösterdiği "saat", UTC base hour'undan offset uzaklığı
    // Hedef yerel saat = targetHour; o yüzden base'i (zonedHour - targetHour) saat geriye almalıyız
    const hourDiff = zonedHour - targetHour;
    // Gün geçişi durumunda zonedDay ile parts.day + dayShift arasında fark olabilir
    const expectedDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayShift)).getUTCDate();
    const expectedMonth = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayShift)).getUTCMonth() + 1;
    let dayDiff = 0;
    if (zonedYear === parts.year && zonedMonth === expectedMonth) {
      dayDiff = zonedDay - expectedDay;
    }
    const totalHoursOffset = dayDiff * 24 + hourDiff;
    return new Date(base.getTime() - totalHoursOffset * 60 * 60 * 1000);
  } catch {
    return base;
  }
}
