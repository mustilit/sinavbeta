import { evaluateWindow, isValidWindow } from '../../src/application/services/email/utils/sendWindow';

describe('sendWindow', () => {
  test('disabled config → inWindow=true, delay=0', () => {
    const r = evaluateWindow(new Date('2026-05-19T03:00:00Z'), {
      enabled: false,
      startHour: 9,
      endHour: 21,
      timezone: 'UTC',
    });
    expect(r.inWindow).toBe(true);
    expect(r.delayMs).toBe(0);
  });

  test('UTC pencere içi (10:00 UTC, 9-21) → inWindow', () => {
    const r = evaluateWindow(new Date('2026-05-19T10:00:00Z'), {
      enabled: true,
      startHour: 9,
      endHour: 21,
      timezone: 'UTC',
    });
    expect(r.inWindow).toBe(true);
  });

  test('UTC pencere dışı sabah erken (06:00 UTC, 9-21) → bugün 09:00 UTC', () => {
    const now = new Date('2026-05-19T06:00:00Z');
    const r = evaluateWindow(now, {
      enabled: true,
      startHour: 9,
      endHour: 21,
      timezone: 'UTC',
    });
    expect(r.inWindow).toBe(false);
    if (!r.inWindow) {
      const expected = new Date('2026-05-19T09:00:00Z');
      expect(Math.abs(r.nextOpensAt.getTime() - expected.getTime())).toBeLessThan(60_000);
      expect(r.delayMs).toBeGreaterThan(0);
      expect(r.delayMs).toBeLessThan(4 * 60 * 60 * 1000);
    }
  });

  test('UTC pencere dışı gece (23:00 UTC, 9-21) → yarın 09:00 UTC', () => {
    const now = new Date('2026-05-19T23:00:00Z');
    const r = evaluateWindow(now, {
      enabled: true,
      startHour: 9,
      endHour: 21,
      timezone: 'UTC',
    });
    expect(r.inWindow).toBe(false);
    if (!r.inWindow) {
      const expected = new Date('2026-05-20T09:00:00Z');
      expect(Math.abs(r.nextOpensAt.getTime() - expected.getTime())).toBeLessThan(60_000);
    }
  });

  test('Tam endHour saatinde → pencere dışı (end exclusive)', () => {
    const r = evaluateWindow(new Date('2026-05-19T21:00:00Z'), {
      enabled: true,
      startHour: 9,
      endHour: 21,
      timezone: 'UTC',
    });
    expect(r.inWindow).toBe(false);
  });

  test('Tam startHour saatinde → pencere içi (start inclusive)', () => {
    const r = evaluateWindow(new Date('2026-05-19T09:00:00Z'), {
      enabled: true,
      startHour: 9,
      endHour: 21,
      timezone: 'UTC',
    });
    expect(r.inWindow).toBe(true);
  });

  test('Europe/Istanbul pencere — yaz UTC+3, 09:00 yerel = 06:00 UTC', () => {
    // Yaz dönemi: Istanbul = UTC+3
    // 06:00 UTC = 09:00 Istanbul → pencere içi
    const r = evaluateWindow(new Date('2026-07-15T06:00:00Z'), {
      enabled: true,
      startHour: 9,
      endHour: 21,
      timezone: 'Europe/Istanbul',
    });
    expect(r.inWindow).toBe(true);
  });

  test('Europe/Istanbul — 03:00 UTC = 06:00 Istanbul → dışı, bugün 09:00 Istanbul (06:00 UTC)', () => {
    const now = new Date('2026-07-15T03:00:00Z');
    const r = evaluateWindow(now, {
      enabled: true,
      startHour: 9,
      endHour: 21,
      timezone: 'Europe/Istanbul',
    });
    expect(r.inWindow).toBe(false);
    if (!r.inWindow) {
      const expectedUtc = new Date('2026-07-15T06:00:00Z');
      expect(Math.abs(r.nextOpensAt.getTime() - expectedUtc.getTime())).toBeLessThan(60_000);
    }
  });

  test('Geçersiz pencere (start > end) → invalid', () => {
    expect(isValidWindow({ enabled: true, startHour: 22, endHour: 6, timezone: 'UTC' })).toBe(false);
  });

  test('Geçersiz pencere (start == end) → invalid', () => {
    expect(isValidWindow({ enabled: true, startHour: 12, endHour: 12, timezone: 'UTC' })).toBe(false);
  });

  test('Hatalı TZ → UTC fallback ile çalışır, hata fırlatmaz', () => {
    expect(() =>
      evaluateWindow(new Date('2026-05-19T12:00:00Z'), {
        enabled: true,
        startHour: 9,
        endHour: 21,
        timezone: 'Mars/Olympus_Mons',
      }),
    ).not.toThrow();
  });
});
