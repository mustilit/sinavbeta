import { EmailProviderKind } from '@prisma/client';
import {
  EmailEnvelope,
  IEmailTransport,
  TransportFailure,
  TransportResult,
  TransportSuccess,
} from './IEmailTransport';

type BrevoSecrets = {
  apiKey: string;
};

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo (ex-Sendinblue) Transactional Email API client.
 * Ücretsiz katman: 300 mail/gün, paylaşımlı IP.
 */
export class BrevoApiProvider implements IEmailTransport {
  readonly kind: EmailProviderKind = 'BREVO_API';

  constructor(private readonly secrets: BrevoSecrets, private readonly timeoutMs = 15_000) {
    if (!secrets.apiKey) {
      throw new Error('BrevoApiProvider: apiKey missing');
    }
  }

  async send(envelope: EmailEnvelope): Promise<TransportResult> {
    const body = {
      sender: { email: envelope.from.email, name: envelope.from.name },
      to: [{ email: envelope.to.email, name: envelope.to.name }],
      replyTo: envelope.replyTo
        ? { email: envelope.replyTo.email, name: envelope.replyTo.name }
        : undefined,
      subject: envelope.subject,
      htmlContent: envelope.html,
      textContent: envelope.text,
      headers: envelope.headers,
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let resp: Response;
    try {
      resp = await fetch(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.secrets.apiKey,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      return this.failure({
        errorCode: err?.name === 'AbortError' ? 'timeout' : 'connection_failed',
        errorMessage: err?.message || 'Network error',
        retryable: true,
        raw: err?.toString?.(),
      });
    }
    clearTimeout(timer);

    let payload: any = null;
    try {
      payload = await resp.json();
    } catch {
      /* may be empty body */
    }

    if (resp.ok && payload?.messageId) {
      return this.success({ messageId: String(payload.messageId), raw: payload });
    }

    // Brevo error shape: { code: '...', message: '...' }
    const code = String(payload?.code || resp.status);
    const msg = String(payload?.message || resp.statusText || 'Brevo API error');

    if (resp.status === 401 || resp.status === 403) {
      return this.failure({
        errorCode: 'auth_failure',
        errorMessage: msg,
        retryable: false,
        raw: payload,
      });
    }
    if (resp.status === 429) {
      return this.failure({
        errorCode: 'rate_limited',
        errorMessage: msg,
        retryable: true,
        raw: payload,
      });
    }
    if (resp.status === 400) {
      const isInvalid = /invalid|recipient|bounce|blocked/i.test(msg);
      return this.failure({
        errorCode: isInvalid ? 'invalid_recipient' : '4xx',
        errorMessage: msg,
        retryable: false,
        raw: payload,
      });
    }
    if (resp.status >= 500) {
      return this.failure({
        errorCode: '5xx',
        errorMessage: msg,
        retryable: true,
        raw: payload,
      });
    }
    return this.failure({
      errorCode: code,
      errorMessage: msg,
      retryable: false,
      raw: payload,
    });
  }

  private success(s: { messageId: string; raw?: unknown }): TransportSuccess {
    return { ok: true, messageId: s.messageId, providerKind: this.kind, raw: s.raw };
  }

  private failure(
    f: Omit<TransportFailure, 'ok' | 'providerKind'>,
  ): TransportFailure {
    return { ok: false, providerKind: this.kind, ...f };
  }
}
