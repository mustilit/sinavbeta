import { randomBytes } from 'crypto';

describe('email/encryption', () => {
  beforeEach(() => {
    process.env.EMAIL_SECRETS_KEY = randomBytes(32).toString('hex');
    jest.resetModules();
  });

  test('round-trip encryptSecret/decryptSecret', async () => {
    const { encryptSecret, decryptSecret } = await import(
      '../../src/application/services/email/utils/encryption'
    );
    const cipher = encryptSecret('hello-world');
    expect(cipher).not.toContain('hello-world');
    expect(decryptSecret(cipher)).toBe('hello-world');
  });

  test('encryptJson/decryptJson preserves structure', async () => {
    const { encryptJson, decryptJson } = await import(
      '../../src/application/services/email/utils/encryption'
    );
    const original = { apiKey: 'brv-xyz', dailyCap: 300 };
    const enc = encryptJson(original);
    expect(decryptJson(enc)).toEqual(original);
  });

  test('decrypt fails with wrong key', async () => {
    const enc = await import('../../src/application/services/email/utils/encryption');
    const cipher = enc.encryptSecret('secret');
    process.env.EMAIL_SECRETS_KEY = randomBytes(32).toString('hex');
    jest.resetModules();
    const enc2 = await import('../../src/application/services/email/utils/encryption');
    expect(() => enc2.decryptSecret(cipher)).toThrow();
  });

  test('maskSecret hides middle', async () => {
    const { maskSecret } = await import(
      '../../src/application/services/email/utils/encryption'
    );
    expect(maskSecret('abcd1234')).toBe('ab••••34');
    expect(maskSecret('')).toBe('');
    expect(maskSecret(null)).toBe('');
  });
});
