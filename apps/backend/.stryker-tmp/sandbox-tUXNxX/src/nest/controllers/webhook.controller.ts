/**
 * WebhookController — `/webhooks/*` — dış sağlayıcı webhook'larını alır.
 *
 * Bu endpoint'ler @Public — JWT bypass çünkü ödeme sağlayıcısı header taşımaz.
 * Güvenlik tamamen imza doğrulamasıyla sağlanır (verifyWebhookSignature).
 *
 * Raw body capture şart: `main.ts`'te `/webhooks/stripe` ve `/webhooks/iyzico`
 * için `express.raw({ type: 'application/json' })` middleware kurulur.
 *
 * Akış:
 *   1. Raw body'yi string'e çevir (Buffer.toString veya JSON.stringify fallback).
 *   2. Header'dan imza al, verifyXxxSignature ile doğrula → 403 reject.
 *   3. Payload'ı JSON.parse, ilgili use case'e devret.
 *   4. Use case dedup eder + iş mantığını yürütür.
 *
 * Status 200 her zaman döner (use case throw etmedikçe). Stripe/Iyzico 2xx
 * görmedikçe retry'a girer; biz dedup ettiğimiz için retry zararsız.
 */
// @ts-nocheck

import {
  Controller,
  Post,
  Req,
  HttpCode,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { HandleStripeWebhookUseCase } from '../../application/use-cases/billing/HandleStripeWebhookUseCase';
import { HandleIyzicoWebhookUseCase } from '../../application/use-cases/billing/HandleIyzicoWebhookUseCase';
import {
  verifyStripeSignature,
  verifyIyzicoSignature,
} from '../security/verifyWebhookSignature';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly handleStripe: HandleStripeWebhookUseCase,
    private readonly handleIyzico: HandleIyzicoWebhookUseCase,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async stripe(@Req() req: any): Promise<{ received: boolean }> {
    const payload = this.readRawBody(req);
    const sig =
      (typeof req.header === 'function' ? req.header('stripe-signature') : undefined) ??
      req.headers?.['stripe-signature'];

    const verdict = verifyStripeSignature(
      payload,
      typeof sig === 'string' ? sig : undefined,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
    if (!verdict.valid) {
      this.logger.warn(`stripe webhook reject: ${verdict.reason}`);
      throw new ForbiddenException();
    }

    let event: any;
    try {
      event = JSON.parse(payload);
    } catch (err) {
      throw new BadRequestException('Geçersiz JSON payload');
    }

    await this.handleStripe.execute(event);
    return { received: true };
  }

  @Public()
  @Post('iyzico')
  @HttpCode(200)
  async iyzico(@Req() req: any): Promise<{ received: boolean }> {
    const payload = this.readRawBody(req);
    const sig =
      (typeof req.header === 'function' ? req.header('x-iyz-signature-v2') : undefined) ??
      req.headers?.['x-iyz-signature-v2'];

    const verdict = verifyIyzicoSignature(
      payload,
      typeof sig === 'string' ? sig : undefined,
      process.env.IYZICO_API_KEY,
      process.env.IYZICO_SECRET,
    );
    if (!verdict.valid) {
      this.logger.warn(`iyzico webhook reject: ${verdict.reason}`);
      throw new ForbiddenException();
    }

    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      throw new BadRequestException('Geçersiz JSON payload');
    }

    await this.handleIyzico.execute(parsed);
    return { received: true };
  }

  /**
   * Raw body'yi imza doğrulamak için string'e çevirir.
   *   - main.ts'te `express.raw()` aktifse req.body Buffer olur → toString('utf8').
   *   - Fallback: zaten parse edilmiş object → JSON.stringify (imza doğru olmaz,
   *     ama verdict false dönecek; sessizce 403).
   */
  private readRawBody(req: any): string {
    const body = req.body;
    if (Buffer.isBuffer(body)) return body.toString('utf8');
    if (typeof body === 'string') return body;
    return JSON.stringify(body ?? {});
  }
}
