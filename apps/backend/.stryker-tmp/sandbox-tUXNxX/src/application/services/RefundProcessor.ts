// @ts-nocheck
import type { RefundRequest } from '../../domain/interfaces/IRefundRepository';

/**
 * Dummy processor for approved refunds. No payment integration, queue, or notification in this micro.
 * RefundProcessor.process(refund) is a noop and returns ok.
 */
export class RefundProcessor {
  async process(_refund: RefundRequest): Promise<void> {
    // Noop: real refund integration / queue / notification out of scope
  }
}
