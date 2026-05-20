// @ts-nocheck
import type { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';

/**
 * Educator inceleme süresi (7 gün) dolmuş PENDING iade taleplerini
 * ESCALATED statüsüne çeker. Bu use case bir cron job ile tetiklenir.
 */
export class EscalateOverdueRefundsUseCase {
  constructor(private readonly refundRepo: IRefundRepository) {}

  async execute(): Promise<{ escalated: number }> {
    const count = await this.refundRepo.escalateOverdue();
    return { escalated: count };
  }
}
