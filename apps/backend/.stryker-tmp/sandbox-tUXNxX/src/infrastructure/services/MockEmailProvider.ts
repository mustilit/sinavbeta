// @ts-nocheck
import { IEmailProvider } from '../../domain/interfaces/IEmailProvider';

export class MockEmailProvider implements IEmailProvider {
  sent: Array<{ to: string; subject: string; body: string; date: string }> = [];

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const entry = { to, subject, body, date: new Date().toISOString() };
    this.sent.push(entry);
    // Log for development
    // eslint-disable-next-line no-console
    console.log('[MockEmail] sendEmail', entry);
  }
}

