/**
 * BrevoApiProvider unit testleri.
 * fetch global'i jest ile mock'lanır.
 */
import { BrevoApiProvider } from '../../src/application/services/email/providers/BrevoApiProvider';

const makeEnvelope = () => ({
  from: { email: 'from@test.com', name: 'From' },
  to: { email: 'to@test.com', name: 'To' },
  subject: 'Test Subject',
  html: '<p>Hello</p>',
  text: 'Hello',
  headers: {},
});

const makeFetchResponse = (status: number, body: any = null) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: jest.fn().mockResolvedValue(body),
});

describe('BrevoApiProvider', () => {
  let provider: BrevoApiProvider;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    provider = new BrevoApiProvider({ apiKey: 'test-api-key-12345' });
    mockFetch = jest.fn();
    (global as any).fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- Constructor ---

  describe('constructor', () => {
    it('apiKey eksikse hata fırlatır', () => {
      expect(() => new BrevoApiProvider({ apiKey: '' })).toThrow('apiKey missing');
    });
  });

  // --- Başarı ---

  describe('send — başarı', () => {
    it('Brevo 200 ve messageId döndürdüğünde ok:true sonuç döner', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce(
        makeFetchResponse(201, { messageId: 'brevo-msg-id-123' }),
      );

      // Act
      const result = await provider.send(makeEnvelope());

      // Assert
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.messageId).toBe('brevo-msg-id-123');
        expect(result.providerKind).toBe('BREVO_API');
      }
    });
  });

  // --- 4xx hatalar ---

  describe('send — 4xx hatalar', () => {
    it('401 auth hatası → ok:false retryable:false döner', async () => {
      mockFetch.mockResolvedValueOnce(
        makeFetchResponse(401, { code: 'unauthorized', message: 'Invalid API key' }),
      );
      const result = await provider.send(makeEnvelope());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.retryable).toBe(false);
        expect(result.errorCode).toBe('auth_failure');
      }
    });

    it('429 rate limit → ok:false retryable:true döner', async () => {
      mockFetch.mockResolvedValueOnce(
        makeFetchResponse(429, { code: 'rate_limit', message: 'Too many requests' }),
      );
      const result = await provider.send(makeEnvelope());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.retryable).toBe(true);
        expect(result.errorCode).toBe('rate_limited');
      }
    });

    it('400 geçersiz alıcı → ok:false retryable:false döner', async () => {
      mockFetch.mockResolvedValueOnce(
        makeFetchResponse(400, { code: 'invalid_parameter', message: 'invalid recipient address' }),
      );
      const result = await provider.send(makeEnvelope());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.retryable).toBe(false);
        expect(result.errorCode).toBe('invalid_recipient');
      }
    });
  });

  // --- 5xx hatalar ---

  describe('send — 5xx hatalar', () => {
    it('500 sunucu hatası → ok:false retryable:true döner', async () => {
      mockFetch.mockResolvedValueOnce(
        makeFetchResponse(500, { message: 'Internal server error' }),
      );
      const result = await provider.send(makeEnvelope());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.retryable).toBe(true);
        expect(result.errorCode).toBe('5xx');
      }
    });
  });

  // --- Network hataları ---

  describe('send — ağ hataları', () => {
    it('fetch exception → ok:false retryable:true döner', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await provider.send(makeEnvelope());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.retryable).toBe(true);
        expect(result.errorCode).toBe('connection_failed');
      }
    });

    it('AbortError (timeout) → errorCode timeout döner', async () => {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortErr);
      const result = await provider.send(makeEnvelope());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errorCode).toBe('timeout');
      }
    });
  });
});
