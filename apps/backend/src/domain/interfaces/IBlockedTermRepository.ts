import { ModerationCategory } from '@prisma/client';

export interface BlockedTermRecord {
  id: string;
  tenantId: string;
  term: string;
  /** Opsiyonel regex pattern — yoksa literal substring eşleşmesi */
  pattern: string | null;
  category: ModerationCategory;
  /** Severity 1-5 (5 = en ağır) */
  severity: number;
  isActive: boolean;
  createdBy: string | null;
}

export interface IBlockedTermRepository {
  /**
   * Tenant'a ait aktif tüm yasaklı terimleri getirir.
   * Redis cache ile 60 saniye TTL.
   */
  findActiveByTenant(tenantId: string): Promise<BlockedTermRecord[]>;

  findById(id: string): Promise<BlockedTermRecord | null>;

  create(data: {
    tenantId: string;
    term: string;
    pattern?: string | null;
    category: ModerationCategory;
    severity?: number;
    isActive?: boolean;
    createdBy?: string | null;
  }): Promise<BlockedTermRecord>;

  update(
    id: string,
    data: Partial<{
      term: string;
      pattern: string | null;
      category: ModerationCategory;
      severity: number;
      isActive: boolean;
    }>,
  ): Promise<BlockedTermRecord>;

  delete(id: string): Promise<void>;

  /** Cache'i temizle (yeni term eklendiğinde/silindiğinde çağrılır) */
  invalidateCache(tenantId: string): Promise<void>;
}
