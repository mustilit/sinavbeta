/**
 * WebhookController unit testleri.
 * Stripe/Iyzico imzaları mock'lanır; use case'ler stub.
 */
import { ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';

// verifyWebhookSignature jest.mock ile override
jest.mock('../../src/nest/security/verifyWebhookSignature', () => ({
  verifyStripeSignature: jest.fn(),
  verifyIyzicoSignature: jest.fn(),
}));

import { WebhookController } from '../../src/nest/controllers/webhook.controller';
import { HandleStripeWebhookUseCase } from '../../src/application/use-cases/billing/HandleStripeWebhookUseCase';
import { HandleIyzicoWebhookUseCase } from '../../src/application/use-cases/billing/HandleIyzicoWebhookUseCase';
import {
  verifyStripeSignature,
  verifyIyzicoSignature,
} from '../../src/nest/security/verifyWebhookSignature';

const mockVerifyStripe = verifyStripeSignature as jest.Mock;
const mockVerifyIyzico = verifyIyzicoSignature as jest.Mock;

describe('WebhookController', () => {
  let controller: WebhookController;
  let mockStripeUC: jest.Mocked<HandleStripeWebhookUseCase>;
  let mockIyzicoUC: jest.Mocked<HandleIyzicoWebhookUseCase>;

  // Logger.warn'ı mock'la — console çıktısını gizle
  beforeAll(() => { jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}); });
  afterAll(() => { jest.restoreAllMocks(); });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStripeUC = { execute: jest.fn().mockResolvedValue(undefined) } as any;
    mockIyzicoUC = { execute: jest.fn().mockResolvedValue(undefined) } as any;
    controller = new WebhookController(mockStripeUC, mockIyzicoUC);
  });

  // ---- Stripe ----

  describe('stripe endpoint', () => {
    it('geçerli imzayla { received: true } döner ve use case\'i çağırır', async () => {
      // Arrange
      const event = { type: 'checkout.session.completed', id: 'evt_1' };
      const body = JSON.stringify(event);
      mockVerifyStripe.mockReturnValueOnce({ valid: true });
      const req = {
        body: Buffer.from(body),
        header: () => 't=1,v1=abc',
        headers: {},
      };

      // Act
      const result = await controller.stripe(req as any);

      // Assert
      expect(result).toEqual({ received: true });
      expect(mockStripeUC.execute).toHaveBeenCalledWith(event);
    });

    it('geçersiz imzayla ForbiddenException fırlatır', async () => {
      mockVerifyStripe.mockReturnValueOnce({ valid: false, reason: 'signature-mismatch' });
      const req = {
        body: Buffer.from('{}'),
        header: () => 'bad-sig',
        headers: {},
      };
      await expect(controller.stripe(req as any)).rejects.toThrow(ForbiddenException);
      expect(mockStripeUC.execute).not.toHaveBeenCalled();
    });

    it('geçerli imza ama bozuk JSON BadRequestException fırlatır', async () => {
      mockVerifyStripe.mockReturnValueOnce({ valid: true });
      const req = {
        body: Buffer.from('not-valid-json{'),
        header: () => 'sig',
        headers: {},
      };
      await expect(controller.stripe(req as any)).rejects.toThrow(BadRequestException);
    });

    it('string body da kabul edilir', async () => {
      const body = JSON.stringify({ type: 'payment_intent.succeeded' });
      mockVerifyStripe.mockReturnValueOnce({ valid: true });
      const req = { body, header: () => 'sig', headers: {} };
      const result = await controller.stripe(req as any);
      expect(result).toEqual({ received: true });
    });
  });

  // ---- Iyzico ----

  describe('iyzico endpoint', () => {
    it('geçerli imzayla { received: true } döner ve use case\'i çağırır', async () => {
      const event = { status: 'success', paymentId: '123' };
      const body = JSON.stringify(event);
      mockVerifyIyzico.mockReturnValueOnce({ valid: true });
      const req = {
        body: Buffer.from(body),
        header: () => 'hash123',
        headers: {},
      };

      const result = await controller.iyzico(req as any);

      expect(result).toEqual({ received: true });
      expect(mockIyzicoUC.execute).toHaveBeenCalledWith(event);
    });

    it('geçersiz imzayla ForbiddenException fırlatır', async () => {
      mockVerifyIyzico.mockReturnValueOnce({ valid: false, reason: 'signature-mismatch' });
      const req = { body: Buffer.from('{}'), header: () => 'bad', headers: {} };
      await expect(controller.iyzico(req as any)).rejects.toThrow(ForbiddenException);
    });
  });
});
