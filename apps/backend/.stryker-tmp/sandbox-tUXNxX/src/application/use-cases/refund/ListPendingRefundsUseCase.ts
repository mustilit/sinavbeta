// @ts-nocheck
import type { RefundListItem, RefundStatus } from '../../../domain/interfaces/IRefundRepository';
import type { IRefundRepository } from '../../../domain/interfaces/IRefundRepository';

/** Admin paneli için işlem bekleyen statüler (varsayılan) */
const ADMIN_ACTION_STATUSES: RefundStatus[] = ['EDUCATOR_APPROVED', 'APPEAL_PENDING', 'ESCALATED'];

/**
 * Admin paneli için iade taleplerini statüye göre listeler.
 * status parametresi verilmezse admin aksiyonu gereken talepler döner.
 */
export class ListPendingRefundsUseCase {
  constructor(private readonly refundRepo: IRefundRepository) {}

  async execute(status?: string): Promise<RefundListItem[]> {
    if (!status || status === 'actionable') {
      return this.refundRepo.findByStatuses(ADMIN_ACTION_STATUSES);
    }
    // Tek statü ile filtrele
    return this.refundRepo.findByStatus(status as RefundStatus);
  }
}
