/**
 * CustomThrottlerGuard.generateKey — per-user rate-limit anahtarı testleri.
 *
 * Bağlam (2026-06-08 yük testi): throttler route auth'tan önce çalıştığı için
 * req.user set değildi → key IP'ye düşüyordu → aynı NAT IP'li lab adayları tek
 * bucket'ı paylaşıp 429 alıyordu. Düzeltme: throttler Authorization token'ını
 * KENDİSİ doğrulayıp userId çıkarır. Bu test o davranışı kilitler.
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
function ctxWith(req: any) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}
const sign = (sub: string) => jwt.sign({ sub, role: 'CANDIDATE' }, SECRET, { expiresIn: 3600 });

describe('CustomThrottlerGuard.generateKey — per-user anahtar', () => {
  const guard = makeGuard();

  it('geçerli Bearer token varsa (req.user YOK bile) user:<id> döner', () => {
    const req = {
      headers: { authorization: `Bearer ${sign('cand-1')}`, 'x-client-app': 'sinavsalonu-web/1' },
      ip: '203.0.113.9',
    };
    expect(guard.generateKey(ctxWith(req), '')).toBe('user:cand-1');
  });

  it('aynı IP, FARKLI tokenlar → AYRI bucket (lab senaryosu çözülür)', () => {
    const ip = '10.0.0.5';
    const k1 = guard.generateKey(ctxWith({ headers: { authorization: `Bearer ${sign('a')}` }, ip }), '');
    const k2 = guard.generateKey(ctxWith({ headers: { authorization: `Bearer ${sign('b')}` }, ip }), '');
    expect(k1).toBe('user:a');
    expect(k2).toBe('user:b');
    expect(k1).not.toBe(k2);
  });

  it('req.user.id set ise onu kullanır (öncelik)', () => {
    const req = { user: { id: 'pre-set' }, headers: { authorization: `Bearer ${sign('other')}` }, ip: '1.1.1.1' };
    expect(guard.generateKey(ctxWith(req), '')).toBe('user:pre-set');
  });

  it('token yoksa IP fallback (trusted header → ip:)', () => {
    const req = { headers: { 'x-client-app': 'sinavsalonu-web/1' }, ip: '198.51.100.7' };
    expect(guard.generateKey(ctxWith(req), '')).toBe('ip:198.51.100.7');
  });

  it('geçersiz imzalı token → user key DEĞİL, IP fallback (spoof engellenir)', () => {
    const bad = jwt.sign({ sub: 'spoof' }, 'wrong-secret', { expiresIn: 3600 });
    const req = { headers: { authorization: `Bearer ${bad}`, 'x-client-app': 'sinavsalonu-web/1' }, ip: '198.51.100.8' };
    expect(guard.generateKey(ctxWith(req), '')).toBe('ip:198.51.100.8');
  });

  it('header yok + untrusted → ip:untrusted:', () => {
    const req = { headers: {}, ip: '192.0.2.3' };
    expect(guard.generateKey(ctxWith(req), '')).toBe('ip:untrusted:192.0.2.3');
  });
});
