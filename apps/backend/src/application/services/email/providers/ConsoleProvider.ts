import { EmailProviderKind } from '@prisma/client';
import { EmailEnvelope, IEmailTransport, TransportResult } from './IEmailTransport';

/**
 * Dev/test sağlayıcısı — stdout'a yazar ve başarılı döner.
 * `NODE_ENV === 'production'` durumunda asla kullanılmamalıdır;
 * ProviderRegistry üretim ortamında bu kind'i reddeder.
 */
export class ConsoleProvider implements IEmailTransport {
  readonly kind: EmailProviderKind = 'CONSOLE';
  public readonly sent: Array<EmailEnvelope & { sentAt: string }> = [];

  async send(envelope: EmailEnvelope): Promise<TransportResult> {
    const record = { ...envelope, sentAt: new Date().toISOString() };
    this.sent.push(record);
    // eslint-disable-next-line no-console
    console.log(
      '[ConsoleEmail]',
      JSON.stringify(
        {
          to: envelope.to.email,
          from: envelope.from.email,
          subject: envelope.subject,
          textPreview: envelope.text?.slice(0, 120),
        },
        null,
        2,
      ),
    );
    return {
      ok: true,
      messageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      providerKind: this.kind,
      raw: { recorded: true },
    };
  }
}
