export type RefundStatus =
  | 'PENDING'
  | 'EDUCATOR_APPROVED'
  | 'EDUCATOR_REJECTED'
  | 'APPEAL_PENDING'
  | 'ESCALATED'
  | 'APPROVED'
  | 'REJECTED';

export type RefundSource = 'TEST' | 'TUNNEL' | 'WRITTEN';

export type RefundRequest = {
  id: string;
  source: RefundSource;
  purchaseId: string | null;
  tunnelPurchaseId?: string | null;
  writtenPurchaseId?: string | null;
  tunnelId?: string | null;
  writtenPackageId?: string | null;
  candidateId: string;
  educatorId: string;
  testId: string | null;
  reason?: string | null;
  description?: string | null;
  status: RefundStatus;
  educatorDeadline?: string | null;
  educatorDecidedAt?: string | null;
  appealReason?: string | null;
  appealedAt?: string | null;
  decidedBy?: string | null;
  decidedAt?: string | null;
  adminNotes?: string | null;
  createdAt: string;
  updatedAt?: string;
};

/** Refund list item with optional content title for UX (test/tunnel/written başlığı) */
export type RefundListItem = RefundRequest & { testTitle?: string | null };

export interface IRefundRepository {
  create(input: {
    source?: RefundSource;
    purchaseId?: string | null;
    tunnelPurchaseId?: string | null;
    writtenPurchaseId?: string | null;
    tunnelId?: string | null;
    writtenPackageId?: string | null;
    candidateId: string;
    educatorId: string;
    testId?: string | null;
    reason?: string;
    description?: string;
    educatorDeadline?: Date;
  }): Promise<RefundRequest>;
  findByPurchaseId(purchaseId: string): Promise<RefundRequest | null>;
  /** TUNNEL/WRITTEN kaynaklı dedup için kaynak satın alma id'siyle arar */
  findBySourcePurchaseId(source: RefundSource, sourcePurchaseId: string): Promise<RefundRequest | null>;
  findById(id: string): Promise<RefundRequest | null>;
  findByCandidateId(candidateId: string): Promise<RefundListItem[]>;
  /** Tek statü ile filtrele (geriye dönük uyumluluk için korunur) */
  findByStatus(status: RefundStatus): Promise<RefundListItem[]>;
  /** Birden fazla statü ile filtrele */
  findByStatuses(statuses: RefundStatus[]): Promise<RefundListItem[]>;
  /** Educator'ın kendi testlerine ait iade taleplerini listeler */
  findByEducatorId(educatorId: string): Promise<RefundListItem[]>;
  updateStatus(id: string, status: 'APPROVED' | 'REJECTED', decidedBy: string): Promise<RefundRequest>;
  approve(refundId: string, adminId: string, decidedAt: Date, adminNotes?: string): Promise<RefundRequest>;
  reject(refundId: string, adminId: string, decidedAt: Date, reason?: string): Promise<RefundRequest>;
  /** Educator iade talebini onaylar → EDUCATOR_APPROVED */
  educatorApprove(refundId: string, educatorId: string): Promise<RefundRequest>;
  /** Educator iade talebini reddeder → EDUCATOR_REJECTED */
  educatorReject(refundId: string, educatorId: string, reason?: string): Promise<RefundRequest>;
  /** Aday EDUCATOR_REJECTED talebi için itiraz başlatır → APPEAL_PENDING */
  appeal(refundId: string, candidateId: string, appealReason?: string): Promise<RefundRequest>;
  /** Süresi geçmiş PENDING talepleri ESCALATED'a çeker; güncellenen kayıt sayısını döner */
  escalateOverdue(): Promise<number>;
}
