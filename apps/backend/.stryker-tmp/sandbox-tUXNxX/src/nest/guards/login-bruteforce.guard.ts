// @ts-nocheck
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { incrWithTtl, getCount } from '../common/rate-limit';
import { CaptchaService } from '../services/captcha.service';

const LOGIN_IP_LIMIT = Number(process.env.LOGIN_IP_LIMIT ?? '20') || 20;
const LOGIN_IP_TTL_SECONDS = Number(process.env.LOGIN_IP_TTL_SECONDS ?? '60') || 60;
const LOGIN_EMAIL_LIMIT = Number(process.env.LOGIN_EMAIL_LIMIT ?? '10') || 10;
const LOGIN_EMAIL_TTL_SECONDS = Number(process.env.LOGIN_EMAIL_TTL_SECONDS ?? '60') || 60;
const LOGIN_CAPTCHA_AFTER_IP = Number(process.env.LOGIN_CAPTCHA_AFTER_IP ?? '10') || 10;
const LOGIN_CAPTCHA_AFTER_EMAIL = Number(process.env.LOGIN_CAPTCHA_AFTER_EMAIL ?? '5') || 5;

@Injectable()
export class LoginBruteforceGuard implements CanActivate {
  constructor(private readonly captcha: CaptchaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const ip = this.getIp(req);
    const email = this.getEmail(req);

    const ipKey = `login:ip:${ip}`;
    const emailKey = email ? `login:email:${email}` : null;

    // Önce MEVCUT sayaçları oku (artırmadan).
    // Bu sayede limitteki son kullanıcı doğru şifreyle girdiğinde controller çalışabilir
    // ve delKey ile sayaçlar sıfırlanabilir. Guard'dan önce increment yapılırsa
    // controller hiç çalışmaz → delKey asla çağrılmaz → kullanıcı kilitli kalır.
    const [ipNow, emailNow] = await Promise.all([
      getCount(ipKey),
      emailKey ? getCount(emailKey) : Promise.resolve(0),
    ]);

    // Hard limit → mevcut sayaç zaten eşikte veya üstündeyse reddet (increment yapma)
    if (ipNow >= LOGIN_IP_LIMIT || emailNow >= LOGIN_EMAIL_LIMIT) {
      const ttl = ipNow >= LOGIN_IP_LIMIT ? LOGIN_IP_TTL_SECONDS : LOGIN_EMAIL_TTL_SECONDS;
      const res = context.switchToHttp().getResponse<any>();
      res.setHeader('Retry-After', String(ttl));
      throw new HttpException(
        {
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many requests',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Limit aşılmadı — bu denemeyi say
    const [ipCount, emailCount] = await Promise.all([
      incrWithTtl(ipKey, LOGIN_IP_TTL_SECONDS),
      emailKey ? incrWithTtl(emailKey, LOGIN_EMAIL_TTL_SECONDS) : Promise.resolve(0),
    ]);

    // Captcha eşiği
    const needsCaptcha =
      ipCount >= LOGIN_CAPTCHA_AFTER_IP || (email && emailCount >= LOGIN_CAPTCHA_AFTER_EMAIL);

    if (needsCaptcha && this.captcha.isEnabled()) {
      const token = req.body?.captchaToken ?? req.body?.captcha_token ?? req.body?.captcha;
      const ok = await this.captcha.verify(token, ip);
      if (!token) {
        throw new HttpException(
          {
            error: {
              code: 'CAPTCHA_REQUIRED',
              message: 'Captcha required',
            },
          },
          HttpStatus.FORBIDDEN,
        );
      }
      if (!ok) {
        throw new HttpException(
          {
            error: {
              code: 'CAPTCHA_INVALID',
              message: 'Invalid captcha',
            },
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return true;
  }

  private getIp(req: any): string {
    const xff = req.headers?.['x-forwarded-for'];
    if (xff) {
      const first = Array.isArray(xff) ? xff[0] : String(xff).split(',')[0];
      return first.trim();
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  private getEmail(req: any): string | null {
    const raw = req.body?.email;
    if (!raw) return null;
    return String(raw).trim().toLowerCase();
  }
}

