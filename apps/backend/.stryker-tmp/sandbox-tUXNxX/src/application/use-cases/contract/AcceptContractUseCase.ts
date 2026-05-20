// @ts-nocheck
import type { IContractRepository } from '../../../domain/interfaces/IContractRepository';
import type { IContractAcceptanceRepository } from '../../../domain/interfaces/IContractAcceptanceRepository';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { AppError } from '../../errors/AppError';

/**
 * Kullanıcının belirli bir sözleşmeyi kabul etmesini sağlar.
 *
 * Idempotent davranış: kullanıcı aynı sözleşmeyi daha önce kabul ettiyse
 * yeni kayıt oluşturmadan mevcut kabul tarihini döner.
 * Audit log kaydı best-effort olarak tutulur; hata fırlatmaz.
 */
export class AcceptContractUseCase {
  constructor(
    private readonly contractRepo: IContractRepository,
    private readonly acceptanceRepo: IContractAcceptanceRepository,
    private readonly auditRepo?: IAuditLogRepository,
  ) {}

  /**
   * Sözleşme kabulünü işler.
   *
   * @param params.userId      - Kabul eden kullanıcının kimliği
   * @param params.contractId  - Kabul edilecek sözleşmenin kimliği
   * @param params.ip          - İsteği atan istemcinin IP adresi (opsiyonel, kayıt amaçlı)
   * @param params.userAgent   - İstemci User-Agent başlığı (opsiyonel, kayıt amaçlı)
   * @returns Kabul tarihini ISO 8601 formatında içeren nesne
   */
  async execute(params: {
    userId: string;
    contractId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ acceptedAt: string }> {
    const contract = await this.contractRepo.getById(params.contractId);
    if (!contract) {
      throw new AppError('CONTRACT_NOT_FOUND', 'Contract not found', 404);
    }
    // Yalnızca aktif sözleşmeler kabul edilebilir
    if (!contract.isActive) {
      throw new AppError('CONTRACT_NOT_ACTIVE', 'Contract is not active', 409);
    }

    // Kullanıcı bu sözleşmeyi daha önce kabul ettiyse tekrar kayıt açılmaz
    const existing = await this.acceptanceRepo.findByUserAndContract(params.userId, params.contractId);
    if (existing) {
      return { acceptedAt: existing.acceptedAt.toISOString() };
    }

    // Yeni kabul kaydını oluştur; IP ve User-Agent delil amaçlı saklanır
    const created = await this.acceptanceRepo.create({
      userId: params.userId,
      contractId: params.contractId,
      ip: params.ip,
      userAgent: params.userAgent,
    });

    if (this.auditRepo) {
      try {
        await this.auditRepo.create({
          action: 'CONTRACT_ACCEPTED',
          entityType: 'CONTRACT',
          entityId: params.contractId,
          actorId: params.userId,
          metadata: { acceptanceId: created.id },
        });
      } catch {
        // best-effort: audit log hatası ana akışı kesmez
      }
    }

    return { acceptedAt: created.acceptedAt.toISOString() };
  }
}
