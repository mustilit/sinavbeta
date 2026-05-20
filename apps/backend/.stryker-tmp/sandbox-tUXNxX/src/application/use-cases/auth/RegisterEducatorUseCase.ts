// @ts-nocheck
import { randomUUID } from 'crypto';
import { User, UserPublic } from '../../../domain/entities/User';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import type { IContractRepository } from '../../../domain/interfaces/IContractRepository';
import type { IContractAcceptanceRepository } from '../../../domain/interfaces/IContractAcceptanceRepository';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { JwtService } from '../../../infrastructure/services/JwtService';
import { AppError } from '../../errors/AppError';

/**
 * FR-E-01: Eğitici kaydı ve sözleşme onayı.
 * - Kullanıcı EDUCATOR rolüyle ve PENDING_EDUCATOR_APPROVAL statüsüyle oluşturulur.
 * - Admin onayı gerektiğinden hesap hemen aktif olmaz.
 * - Aktif EDUCATOR sözleşmesi otomatik kabul edilir; audit kaydı oluşturulur.
 */
export class RegisterEducatorUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly contractRepo: IContractRepository,
    private readonly acceptanceRepo: IContractAcceptanceRepository,
    private readonly auditRepo: IAuditLogRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Eğitici kaydını tamamlar ve JWT token döner.
   * @param dto.email    - Eğiticinin e-posta adresi (küçük harfe dönüştürülür).
   * @param dto.username - Kullanıcı adı.
   * @param dto.password - Şifre (hash'lenerek saklanır).
   * @throws {AppError} CONTRACT_NOT_AVAILABLE — Aktif EDUCATOR sözleşmesi yoksa.
   */
  async execute(dto: { email: string; username: string; password: string }): Promise<{ user: UserPublic; token: string }> {
    const passwordHash = await this.passwordService.hash(dto.password);

    // Kullanıcı nesnesi oluşturulur; admin onayı beklendiği için PENDING_EDUCATOR_APPROVAL statüsü
    const user: User = {
      id: randomUUID(),
      email: dto.email.toLowerCase(),
      username: dto.username,
      passwordHash,
      role: 'EDUCATOR',
      status: 'PENDING_EDUCATOR_APPROVAL',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const saved = await this.userRepo.save(user);

    // Aktif EDUCATOR sözleşmesi zorunludur — yoksa kayıt reddedilir
    const contract = await this.contractRepo.getActiveByType('EDUCATOR');
    if (!contract || !contract.isActive) {
      throw new AppError('CONTRACT_NOT_AVAILABLE', 'Active educator contract not found', 400);
    }

    // Daha önce sözleşme kabul edilmemişse yeni kabul kaydı oluşturulur
    const existingAcceptance = await this.acceptanceRepo.findByUserAndContract(saved.id, contract.id);
    if (!existingAcceptance) {
      await this.acceptanceRepo.create({
        userId: saved.id,
        contractId: contract.id,
      });
      // Sözleşme kabulü audit log'a yazılır (best-effort — başarısız olsa kayıt iptal olmaz)
      try {
        await this.auditRepo.create({
          action: 'CONTRACT_ACCEPTED',
          entityType: 'CONTRACT',
          entityId: contract.id,
          actorId: saved.id,
          metadata: { type: 'EDUCATOR' },
        });
      } catch {
        /* best-effort */
      }
    }

    const token = this.jwtService.sign({ sub: saved.id, email: saved.email, role: saved.role });
    return { user: this.toPublic(saved), token };
  }

  /** Kullanıcı entity'sini güvenli public tipine dönüştürür (passwordHash dahil edilmez). */
  private toPublic(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
