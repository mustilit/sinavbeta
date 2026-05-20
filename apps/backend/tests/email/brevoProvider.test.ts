import { BrevoApiProvider } from '../../src/application/services/email/providers/BrevoApiProvider';

function mockFetch(response: { status: number; body: any }) {
  return jest.fn().mockResolvedValue({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: 'mock',
    json: async () => response.body,
  } as any);
}

describe('BrevoApiProvider', () => {
  const env = { ...process.env };
  let origFetch: any;

  beforeEach(() => {
    origFetch = (global as any).fetch;
  });
  afterEach(() => {
    (global as any).fetch = origFetch;
    process.env = { ...env };
  });

  const env_ = {
    to: { email: 'foo@bar.com' },
    from: { email: 'noreply@x.com', name: 'Test' },
    subject: 's',
    html: '<p>hi</p>',
  };

  test('200 + messageId → success', async () => {
    (global as any).fetch = mockFetch({ status: 200, body: { messageId: 'm-123' } });
    const p = new BrevoApiProvider({ apiKey: 'k' });
    const r = await p.send(env_);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.messageId).toBe('m-123');
  });

  test('429 → rate_limited retryable', async () => {
    (global as any).fetch = mockFetch({ status: 429, body: { message: 'too many' } });
    const p = new BrevoApiProvider({ apiKey: 'k' });
    const r = await p.send(env_);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('rate_limited');
      expect(r.retryable).toBe(true);
    }
  });

  test('401 → auth_failure non-retryable', async () => {
    (global as any).fetch = mockFetch({ status: 401, body: { message: 'unauthorized' } });
    const p = new BrevoApiProvider({ apiKey: 'bad' });
    const r = await p.send(env_);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('auth_failure');
      expect(r.retryable).toBe(false);
    }
  });

  test('502 → 5xx retryable', async () => {
    (global as any).fetch = mockFetch({ status: 502, body: { message: 'gateway' } });
    const p = new BrevoApiProvider({ apiKey: 'k' });
    const r = await p.send(env_);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('5xx');
      expect(r.retryable).toBe(true);
    }
  });

  test('400 invalid recipient → non-retryable', async () => {
    (global as any).fetch = mockFetch({
      status: 400,
      body: { message: 'invalid recipient email' },
    });
    const p = new BrevoApiProvider({ apiKey: 'k' });
    const r = await p.send(env_);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('invalid_recipient');
      expect(r.retryable).toBe(false);
    }
  });

  test('Network failure → connection_failed retryable', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const p = new BrevoApiProvider({ apiKey: 'k' });
    const r = await p.send(env_);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe('connection_failed');
      expect(r.retryable).toBe(true);
    }
  });

  test('apiKey eksikse constructor fırlatır', () => {
    expect(() => new BrevoApiProvider({ apiKey: '' })).toThrow();
  });
});
