// @ts-nocheck
export interface PurchaseRecord {
  id: string;
  testId: string | null;
  candidateId: string;
  createdAt: Date;
}

export interface PurchaseWithAttemptRecord extends PurchaseRecord {
  packageId: string | null;
  amountCents: number | null;
  paymentStatus: string | null;
  test: { id: string; title: string; status: string; examTypeId: string | null } | null;
  package: { id: string; title: string; priceCents: number } | null;
  attempt: { id: string; status: string; startedAt: Date; completedAt: Date | null } | null;
}

export interface IPurchaseRepository {
  hasPurchase(testId: string, candidateId: string): Promise<boolean>;
  findById(purchaseId: string): Promise<PurchaseRecord | null>;
  findByCandidateId(candidateId: string): Promise<PurchaseWithAttemptRecord[]>;
}

