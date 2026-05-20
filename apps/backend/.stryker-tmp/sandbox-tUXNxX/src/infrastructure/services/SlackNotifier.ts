// @ts-nocheck
import https from 'https';

export class SlackNotifier {
  private webhookUrl: string | undefined;
  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL;
  }

  async notify(text: string) {
    if (!this.webhookUrl) return;
    const payload = JSON.stringify({ text });
    const url = new URL(this.webhookUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + (url.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    return new Promise<void>((resolve, reject) => {
      const req = https.request(options, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

