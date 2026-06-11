import { randomBytes, randomUUID } from 'crypto';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import type { IContractRepository } from '../../../domain/interfaces/IContractRepository';
import type { IContractAcceptanceRepository } from '../../../domain/interfaces/IContractAcceptanceRepository';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import type { IPendingRegistrationRepository } from '../../../domain/interfaces/IPendingRegistrationRepository';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { AppError } from '../../errors/AppError';
import { getDefaultTenantId } from '../../../common/tenant';
import { assertPasswordPolicy } from './passwordPolicy';

/**
 * Aday (CANDIDATE) kullanıcı kaydını gerçekleştirir.
 *
 * Sprint 14 — Sözleşme onayı zorunluluğu.
 *
 * Yeni davranış (pending-first kayıt):
 *   1. User tablosuna YAZILMAZ.
 *   2. PendingRegistration tablosuna yazılır.
 *   3. Email doğrulama linki gönderilir.
 *   4. Kullanıcı linke tıklayınca VerifyEmailUseCase User'ı oluşturur.
 *
 * Mevcut User kayıtları (emailVerified=false olanlar dahil) dokunulmaz.
 */
export class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordService: PasswordService,
    /**
     * Sprint 14 — Sözleşme zorlamak için. Opsiyonel: DI verilmediği test
     * senaryolarında acceptance step'i atlanır (backward compatible).
     */
    private readonly contractRepo?: IContractRepository,
    private readonly acceptanceRepo?: IContractAcceptanceRepository,
    private readonly auditRepo?: IAuditLogRepository,
    private readonly pendingRepo?: IPendingRegistrationRepository,
  ) {}

  /**
   * Yeni bir aday kaydı başlatır: PendingRegistration oluşturur, User YARATMAZ.
   *
   * @returns { message, email } — token ve user bilgisi dönmez (güvenlik).
   */
  async execute(
    dto: {
      email: string;
      username: string;
      password: string;
      acceptedTermsContractId?: string;
      acceptedPrivacyContractId?: string;
    },
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<{ message: string; email: string }> {
    const email = dto.email.toLowerCase();

    // Sözleşme zorlaması — DI verilmişse contract kontrolü yap
    let activeTerms: { id: string } | null = null;
    let activePrivacy: { id: string } | null = null;
    if (this.contractRepo && this.acceptanceRepo) {
      activeTerms = await this.contractRepo.getActiveByType('CANDIDATE');
      activePrivacy = await this.contractRepo.getActiveByType('PRIVACY');
      if (!activeTerms || !activePrivacy) {
        throw new AppError(
          'CONTRACTS_NOT_AVAILABLE',
          'Aktif üyelik veya gizlilik sözleşmesi bulunamadı — sistem yöneticisine başvurun',
          503,
        );
      }
      if (
        !dto.acceptedTermsContractId ||
        !dto.acceptedPrivacyContractId ||
        dto.acceptedTermsContractId !== activeTerms.id ||
        dto.acceptedPrivacyContractId !== activePrivacy.id
      ) {
        throw new AppError(
          'TERMS_NOT_ACCEPTED',
          'Üyelik sözleşmesi ve KVKK aydınlatma metni kabulü zorunludur',
          400,
        );
      }
    }

    // Mevcut User çakışma kontrolü — User tablosunda varsa hata ver
    const existingByEmail = await this.userRepository.findByEmail(email);
    if (existingByEmail) {
      throw new AppError('EMAIL_ALREADY_REGISTERED', 'Bu e-posta adresi zaten kayıtlı', 400);
    }
    const existingByUsername = await this.userRepository.findByUsername(dto.username);
    if (existingByUsername) {
      throw new AppError('USERNAME_ALREADY_TAKEN', 'Bu kullanıcı adı zaten alınmış', 400);
    }

    // Ortak şifre politikası: 8+ karakter, büyük/küçük harf ve rakam zorunlu.
    assertPasswordPolicy(dto.password);

    const passwordHash = await this.passwordService.hash(dto.password);

    // PendingRegistration desteği varsa pending-first akış
    if (this.pendingRepo) {
      // Aynı email için eski pending varsa temizle (re-issue)
      await this.pendingRepo.deleteByEmail(email);
      // Aynı username için eski pending varsa temizle (farklı email olabilir)
      await this.pendingRepo.deleteByUsername(dto.username);

      const verificationToken = randomBytes(32).toString('hex');
      const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.pendingRepo.create({
        email,
        username: dto.username,
        passwordHash,
        role: 'CANDIDATE',
        acceptedTermsContractId: dto.acceptedTermsContractId ?? null,
        acceptedPrivacyContractId: dto.acceptedPrivacyContractId ?? null,
        verificationToken,
        verificationTokenExpiresAt,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        tenantId: getDefaultTenantId(),
      });

      return { message: 'Doğrulama maili gönderildi', email };
    }

    // Fallback (pendingRepo DI verilmemişse): eski davranış — direkt User oluştur
    // Bu yol yalnızca eski testler için backward-compat. Production'da pendingRepo daima verilir.
    const user = {
      id: randomUUID(),
      email,
      username: dto.username,
      passwordHash,
      role: 'CANDIDATE' as const,
      status: 'ACTIVE' as const,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const saved = await this.userRepository.save(user);

    if (this.acceptanceRepo && activeTerms && activePrivacy) {
      for (const contract of [activeTerms, activePrivacy]) {
        await this.acceptanceRepo.create({
          userId: saved.id,
          contractId: contract.id,
          ip: ctx?.ip,
          userAgent: ctx?.userAgent,
        });
        if (this.auditRepo) {
          try {
            await this.auditRepo.create({
              action: 'CONTRACT_ACCEPTED',
              entityType: 'CONTRACT',
              entityId: contract.id,
              actorId: saved.id,
              metadata: { during: 'register', role: 'CANDIDATE' },
            });
          } catch {
            /* best-effort */
          }
        }
      }
    }

    // Eski backward-compat dönüş: UserPublic shape (passwordHash hariç)
    return {
      id: saved.id,
      email: saved.email,
      username: saved.username,
      role: saved.role,
      status: saved.status,
      createdAt: saved.createdAt,
      message: 'Kullanıcı oluşturuldu',
    } as any;
  }
}
