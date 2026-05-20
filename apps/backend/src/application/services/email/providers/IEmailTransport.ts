import { EmailProviderKind } from '@prisma/client';

export type EmailEnvelope = {
  to: { email: string; name?: string };
  from: { email: string; name?: string };
  replyTo?: { email: string; name?: string };
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
};

export type TransportSuccess = {
  ok: true;
  messageId: string;
  providerKind: EmailProviderKind;
  raw?: unknown;
};

export type TransportFailure = {
  ok: false;
  errorCode: string;          // "rate_limited" | "invalid_recipient" | "5xx" | "auth_failure" | "connection_failed"
  errorMessage: string;
  retryable: boolean;         // false → fallback'e geç + log
  providerKind: EmailProviderKind;
  raw?: unknown;
};

export type TransportResult = TransportSuccess | TransportFailure;

/**
 * Tek bir mail sağlayıcı arayüzü.
 * Mevcut IEmailProvider (sendEmail(to, subject, body)) backwards-compat amaçlı korunur;
 * yeni modül bu envelope-tabanlı transport'u kullanır.
 */
export interface IEmailTransport {
  readonly kind: EmailProviderKind;
  send(envelope: EmailEnvelope): Promise<TransportResult>;
}
