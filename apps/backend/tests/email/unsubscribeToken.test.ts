import { randomBytes } from 'crypto';

describe('unsubscribeToken', () => {
  beforeEach(() => {
    process.env.EMAIL_SECRETS_KEY = randomBytes(32).toString('hex');
    jest.resetModules();
  });

  test('üretilen token kendi imzasıyla doğrulanır', async () => {
    const mod = await import('../../src/application/services/email/utils/unsubscribeToken');
    const tok = mod.generateUnsubscribeToken();
    expect(tok.split('.')).toHaveLength(2);
    expect(mod.isWellFormedUnsubscribeToken(tok)).toBe(true);
  });

  test('imza bozulursa doğrulama fail', async () => {
    const mod = await import('../../src/application/services/email/utils/unsubscribeToken');
    const tok = mod.generateUnsubscribeToken();
    const tampered = tok.slice(0, -2) + 'xx';
    expect(mod.isWellFormedUnsubscribeToken(tampered)).toBe(false);
  });

  test('formatsız input reddedilir', async () => {
    const mod = await import('../../src/application/services/email/utils/unsubscribeToken');
    expect(mod.isWellFormedUnsubscribeToken('foo')).toBe(false);
    expect(mod.isWellFormedUnsubscribeToken('')).toBe(false);
    expect(mod.isWellFormedUnsubscribeToken(null as any)).toBe(false);
  });
});
