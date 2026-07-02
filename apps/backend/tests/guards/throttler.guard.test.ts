/**
 * CustomThrottlerGuard.generateKey — per-user + per-route rate-limit anahtarı testleri.
 *
 * Bağlam 1 (2026-06-08 yük testi): throttler route auth'tan önce çalıştığı için
 * req.user set değildi → key IP'ye düşüyordu → aynı NAT IP'li lab adayları tek
 * bucket'ı paylaşıp 429 alıyordu. Düzeltme: throttler Authorization token'ını
 * KENDİSİ doğrulayıp userId çıkarır.
 *
 * Bağlam 2 (2026-07-02 regresyon): Bağlam 1'in düzeltmesi `generateKey`'i
 * `${ClassName}-${handlerName}-${throttlerName}-${identity}` yerine yalnız
 * `${identity}` döndürecek şekilde YAZMIŞTI — rota ayrımı tamamen kaybolmuştu.
 * Sonuç: `@Throttle({ default: {...} })` kullanan TÜM endpoint'ler (global
 * limiter dahil) aynı kullanıcı için TEK bir sayaç paylaşıyordu. Düşük limitli
 * bir route (örn. E-Sınıf "Mesaj Gönder", 10/dk), kullanıcının SİTE GENELİNDEKİ
 * tüm API trafiğine karşı kontrol ediliyordu — kullanıcı o route'u hiç
 * çağırmadan, sadece sayfada gezinirken bile 429 alabiliyordu (üretimde
 * yaşandı: mesaj gönderme ilk denemede "Gönderilemedi" döndü). Bu dosyadaki
 * ikinci describe bloğu bu regresyonu kilitler.
 *
 * NOT: JwtService JWT_SECRET'i modül yüklenince yakalar → secret'ı require'dan
 * ÖNCE set ediyoruz (CommonJS require sırası).
 */
const SECRET = 'unit-throttle-secret-0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = SECRET;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('jsonwebtoken');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CustomThrottlerGuard } = require('../../src/nest/guards/throttler.guard');

function makeGuard(): any {
  return Object.create(CustomThrottlerGuard.prototype);
}
/** Gerçek ExecutionContext'in generateKey'in kullandığı 3 metodunu taklit eder. */
function ctxWith(req: any, opts: { className?: string; handlerName?: string } = {}) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getClass: () => ({ name: opts.className ?? 'TestController' }),
    getHandler: () => ({ name: opts.handlerName ?? 'testHandler' }),
  } as any;
}
const sign = (sub: string) => jwt.sign({ sub, role: 'CANDIDATE' }, SECRET, { expiresIn: 3600 });
const ROUTE = 'TestController-testHandler-default'; // ctxWith default'larına + throttler name 'default'a karşılık gelen önek

describe('CustomThrottlerGuard.generateKey — per-user anahtar', () => {
  const guard = makeGuard();

  it('geçerli Bearer token varsa (req.user YOK bile) user:<id> döner', () => {
    const req = {
      headers: { authorization: `Bearer ${sign('cand-1')}`, 'x-client-app': 'sinavsalonu-web/1' },
      ip: '203.0.113.9',
    };
    expect(guard.generateKey(ctxWith(req), '', 'default')).toBe(`${ROUTE}-user:cand-1`);
  });

  it('aynı IP, FARKLI tokenlar → AYRI bucket (lab senaryosu çözülür)', () => {
    const ip = '10.0.0.5';
    const k1 = guard.generateKey(ctxWith({ headers: { authorization: `Bearer ${sign('a')}` }, ip }), '', 'default');
    const k2 = guard.generateKey(ctxWith({ headers: { authorization: `Bearer ${sign('b')}` }, ip }), '', 'default');
    expect(k1).toBe(`${ROUTE}-user:a`);
    expect(k2).toBe(`${ROUTE}-user:b`);
    expect(k1).not.toBe(k2);
  });

  it('req.user.id set ise onu kullanır (öncelik)', () => {
    const req = { user: { id: 'pre-set' }, headers: { authorization: `Bearer ${sign('other')}` }, ip: '1.1.1.1' };
    expect(guard.generateKey(ctxWith(req), '', 'default')).toBe(`${ROUTE}-user:pre-set`);
  });

  it('token yoksa IP fallback (trusted header → ip:)', () => {
    const req = { headers: { 'x-client-app': 'sinavsalonu-web/1' }, ip: '198.51.100.7' };
    expect(guard.generateKey(ctxWith(req), '', 'default')).toBe(`${ROUTE}-ip:198.51.100.7`);
  });

  it('geçersiz imzalı token → user key DEĞİL, IP fallback (spoof engellenir)', () => {
    const bad = jwt.sign({ sub: 'spoof' }, 'wrong-secret', { expiresIn: 3600 });
    const req = { headers: { authorization: `Bearer ${bad}`, 'x-client-app': 'sinavsalonu-web/1' }, ip: '198.51.100.8' };
    expect(guard.generateKey(ctxWith(req), '', 'default')).toBe(`${ROUTE}-ip:198.51.100.8`);
  });

  it('header yok + untrusted → ip:untrusted:', () => {
    const req = { headers: {}, ip: '192.0.2.3' };
    expect(guard.generateKey(ctxWith(req), '', 'default')).toBe(`${ROUTE}-ip:untrusted:192.0.2.3`);
  });
});

describe('CustomThrottlerGuard.generateKey — rota ayrımı (2026-07-02 regresyon kilidi)', () => {
  const guard = makeGuard();

  it('aynı kullanıcı, FARKLI controller/handler → AYRI bucket', () => {
    const req = { user: { id: 'u1' }, headers: {}, ip: '1.2.3.4' };
    const k1 = guard.generateKey(
      ctxWith(req, { className: 'SchoolNotificationsController', handlerName: 'send' }),
      '',
      'default',
    );
    const k2 = guard.generateKey(
      ctxWith(req, { className: 'SchoolAssignmentsController', handlerName: 'list' }),
      '',
      'default',
    );
    expect(k1).not.toBe(k2);
  });

  it('aynı kullanıcı + aynı controller, FARKLI handler → AYRI bucket', () => {
    const req = { user: { id: 'u1' }, headers: {}, ip: '1.2.3.4' };
    const k1 = guard.generateKey(ctxWith(req, { handlerName: 'send' }), '', 'default');
    const k2 = guard.generateKey(ctxWith(req, { handlerName: 'read' }), '', 'default');
    expect(k1).not.toBe(k2);
  });

  it('aynı kullanıcı + aynı route ama FARKLI throttler adı → AYRI bucket', () => {
    const req = { user: { id: 'u1' }, headers: {}, ip: '1.2.3.4' };
    const k1 = guard.generateKey(ctxWith(req), '', 'default');
    const k2 = guard.generateKey(ctxWith(req), '', 'strict');
    expect(k1).not.toBe(k2);
  });

  it('aynı kullanıcı + aynı route + aynı throttler adı → AYNI bucket (idempotent)', () => {
    const req = { user: { id: 'u1' }, headers: {}, ip: '1.2.3.4' };
    const k1 = guard.generateKey(ctxWith(req), '', 'default');
    const k2 = guard.generateKey(ctxWith(req), '', 'default');
    expect(k1).toBe(k2);
  });
});
