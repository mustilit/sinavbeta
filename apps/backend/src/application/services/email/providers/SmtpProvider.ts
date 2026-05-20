import { EmailProviderKind } from '@prisma/client';
import { createTransport, Transporter } from 'nodemailer';
import {
  EmailEnvelope,
  IEmailTransport,
  TransportFailure,
  TransportResult,
} from './IEmailTransport';

export type SmtpSecrets = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;     // true → 465 SSL/TLS, false → 587 STARTTLS
  smtpUser: string;
  smtpPass: string;
};

/**
 * Kurumsal SMTP / Gmail App Password / Yandex / Office 365 vb. için nodemailer wrapper.
 * Connection pool ile gerçek bir bağlantı her gönderim için yeniden kurulmaz.
 */
export class SmtpProvider implements IEmailTransport {
  readonly kind: EmailProviderKind = 'SMTP';
  private readonly transporter: Transporter;

  constructor(private readonly secrets: SmtpSecrets) {
    if (!secrets.smtpHost || !secrets.smtpUser || !secrets.smtpPass) {
      throw new Error('SmtpProvider: missing host/user/pass');
    }
    this.transporter = createTransport({
      host: secrets.smtpHost,
      port: secrets.smtpPort,
      secure: secrets.smtpSecure,
      auth: { user: secrets.smtpUser, pass: secrets.smtpPass },
      pool: true,
      maxConnections: 5,
      tls: { rejectUnauthorized: true },
    });
  }

  async send(envelope: EmailEnvelope): Promise<TransportResult> {
    try {
      const info = await this.transporter.sendMail({
        from: envelope.from.name
          ? `"${envelope.from.name}" <${envelope.from.email}>`
          : envelope.from.email,
        to: envelope.to.name
          ? `"${envelope.to.name}" <${envelope.to.email}>`
          : envelope.to.email,
        replyTo: envelope.replyTo?.email,
        subject: envelope.subject,
        html: envelope.html,
        text: envelope.text,
        headers: envelope.headers,
      });
      return {
        ok: true,
        messageId: info.messageId,
        providerKind: this.kind,
        raw: { response: info.response, accepted: info.accepted, rejected: info.rejected },
      };
    } catch (err: any) {
      return this.failure(err);
    }
  }

  /**
   * Connection pool'u kapatır. Worker shutdown'da çağrılmalı.
   */
  async close(): Promise<void> {
    try {
      this.transporter.close();
    } catch {
      /* ignore */
    }
  }

  private failure(err: any): TransportFailure {
    const code = String(err?.code || err?.responseCode || 'smtp_error');
    const msg = String(err?.message || 'SMTP send error');
    // 421 / 4xx → temporary, 5xx → permanent
    const status = Number(err?.responseCode);
    const isTemp = status >= 400 && status < 500;
    const isAuth = code === 'EAUTH' || /auth/i.test(msg);
    const isConn = code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET';
    let errorCode: TransportFailure['errorCode'] = code;
    if (isAuth) errorCode = 'auth_failure';
    else if (isConn) errorCode = 'connection_failed';
    else if (status >= 500) errorCode = '5xx';
    else if (isTemp) errorCode = '4xx';
    return {
      ok: false,
      providerKind: this.kind,
      errorCode,
      errorMessage: msg,
      retryable: isTemp || isConn,
      raw: { code, status, stack: err?.stack },
    };
  }
}
