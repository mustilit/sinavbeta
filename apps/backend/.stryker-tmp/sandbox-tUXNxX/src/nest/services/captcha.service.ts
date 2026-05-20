// @ts-nocheck
import { Injectable } from '@nestjs/common';

type Provider = 'turnstile' | 'hcaptcha' | 'none';

@Injectable()
export class CaptchaService {
  private readonly provider: Provider;
  private readonly secret: string | undefined;

  constructor() {
    this.provider = (process.env.CAPTCHA_PROVIDER as Provider) || 'none';
    this.secret = process.env.CAPTCHA_SECRET_KEY;
  }

  isEnabled(): boolean {
    return this.provider !== 'none';
  }

  async verify(token: string | undefined | null, ip?: string | null): Promise<boolean> {
    if (!this.isEnabled()) return true;
    if (!token || !token.trim()) return false;
    if (!this.secret) return false;

    try {
      const body = new URLSearchParams();
      body.set('secret', this.secret);
      body.set('response', token);
      if (ip) body.set('remoteip', ip);

      let endpoint: string;
      if (this.provider === 'turnstile') {
        endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
      } else {
        endpoint = 'https://hcaptcha.com/siteverify';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) return false;
      const data: any = await res.json().catch(() => null);
      return !!data?.success;
    } catch {
      // Prod için fail-safe: doğrulama başarısız say
      return false;
    }
  }
}

