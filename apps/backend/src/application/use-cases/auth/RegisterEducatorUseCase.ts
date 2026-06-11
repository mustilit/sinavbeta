import { randomBytes, randomUUID } from 'crypto';
import type { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import type { IContractRepository } from '../../../domain/interfaces/IContractRepository';
import type { IContractAcceptanceRepository } from '../../../domain/interfaces/IContractAcceptanceRepository';
import type { IAuditLogRepository } from '../../../domain/interfaces/IAuditLogRepository';
import type { IPendingRegistrationRepository } from '../../../domain/interfaces/IPendingRegistrationRepository';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { JwtService } from '../../../infrastructure/services/JwtService';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../../infrastructure/database/prisma';
import { getDefaultTenantId } from '../../../common/tenant';
import { assertPasswordPolicy } from './passwordPolicy';

/**
 * FR-E-01: Eğitici kaydı — pending-first akış.
 *
 * Yeni davranış:
 *   1. User tablosuna YAZILMAZ.
 *   2. PendingRegistration tablosuna yazılır (role=EDUCATOR).
 *   3. Email doğrulama linki gönderilir.
 *   4. Kullanıcı linke tıklayınca VerifyEmailUseCase User'ı oluşturur
 *      (PENDING_EDUCATOR_APPROVAL statüsüyle).
 *
 * firstName ve lastName PendingRegistration'da saklanır; User oluşturulunca kopyalanır.
 */
export class RegisterEducatorUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly contractRepo: IContractRepository,
    private readonly acceptanceRepo: IContractAcceptanceRepository,
    private readonly auditRepo: IAuditLogRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly pendingRepo?: IPendingRegistrationRepository,
  ) {}

  async execute(
    dto: {
      email: string;
      username: string;
      password: string;
      firstName: string;
      lastName: string;
      /** Sprint 14 — Aktif EDUCATOR contract ID (eğitici hizmet sözleşmesi) */
      acceptedEducatorContractId?: string;
      /** Sprint 14 — Aktif PRIVACY contract ID (KVKK aydınlatma) */
      acceptedPrivacyContractId?: string;
      /** Wizard step 2 — CV dosya URL'i (eğitici kayıt için zorunlu, pendingRepo varsa) */
      cvUrl?: string;
      /** Wizard step 2 — uzmanlık exam type ID'leri (en az 1 zorunlu, pendingRepo varsa) */
      specializations?: string[];
      /** Wizard step 2 — mezuniyet / eğitim bilgisi (opsiyonel) */
      educationInfo?: string;
      /** Wizard step 2 — tanıtım metni / bio (opsiyonel) */
      bio?: string;
      /** Wizard step 2 — LinkedIn profil URL'i (opsiyonel) */
      linkedinUrl?: string;
      /** Wizard step 2 — kişisel web sitesi URL'i (opsiyonel) */
      websiteUrl?: string;
    },
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<{ message: string; email: string }> {
    // Zorunlu alan doğrulaması
    const firstName = (dto.firstName ?? '').trim();
    const lastName = (dto.lastName ?? '').trim();
    if (!firstName) throw new AppError('FIRSTNAME_REQUIRED', 'Ad gereklidir', 400);
    if (!lastName) throw new AppError('LASTNAME_REQUIRED', 'Soyad gereklidir', 400);
    if (firstName.length < 2 || firstName.length > 50) {
      throw new AppError('FIRSTNAME_INVALID', 'Ad 2-50 karakter olmalı', 400);
    }
    if (lastName.length < 2 || lastName.length > 50) {
      throw new AppError('LASTNAME_INVALID', 'Soyad 2-50 karakter olmalı', 400);
    }

    const email = dto.email.toLowerCase();

    // Sprint 14 — Aktif EDUCATOR + PRIVACY sözleşmeleri zorunlu
    const educatorContract = await this.contractRepo.getActiveByType('EDUCATOR');
    const privacyContract = await this.contractRepo.getActiveByType('PRIVACY');
    if (!educatorContract || !educatorContract.isActive || !privacyContract || !privacyContract.isActive) {
      throw new AppError(
        'CONTRACT_NOT_AVAILABLE',
        'Aktif eğitici veya gizlilik sözleşmesi bulunamadı — sistem yöneticisine başvurun',
        503,
      );
    }
    if (
      !dto.acceptedEducatorContractId ||
      !dto.acceptedPrivacyContractId ||
      dto.acceptedEducatorContractId !== educatorContract.id ||
      dto.acceptedPrivacyContractId !== privacyContract.id
    ) {
      throw new AppError(
        'TERMS_NOT_ACCEPTED',
        'Eğitici hizmet sözleşmesi ve KVKK aydınlatma metni kabulü zorunludur',
        400,
      );
    }

    // Mevcut User çakışma kontrolü
    const existingByEmail = await this.userRepo.findByEmail(email);
    if (existingByEmail) {
      throw new AppError('EMAIL_ALREADY_REGISTERED', 'Bu e-posta adresi zaten kayıtlı', 400);
    }
    const existingByUsername = await this.userRepo.findByUsername(dto.username);
    if (existingByUsername) {
      throw new AppError('USERNAME_ALREADY_TAKEN', 'Bu kullanıcı adı zaten alınmış', 400);
    }

    // Ortak şifre politikası: 8+ karakter, büyük/küçük harf ve rakam zorunlu.
    assertPasswordPolicy(dto.password);

    const passwordHash = await this.passwordService.hash(dto.password);

    // PendingRegistration desteği varsa pending-first akış
    if (this.pendingRepo) {
      // Wizard step 2 validasyonu: cvUrl ve specializations zorunlu
      if (!dto.cvUrl || !dto.cvUrl.trim()) {
        throw new AppError('CV_REQUIRED', 'CV yüklemesi zorunludur', 400);
      }
      if (!dto.specializations || dto.specializations.length === 0) {
        throw new AppError('SPECIALIZATION_REQUIRED', 'En az bir uzmanlık alanı seçilmelidir', 400);
      }

      // Aynı email/username için eski pending varsa temizle (re-issue)
      await this.pendingRepo.deleteByEmail(email);
      await this.pendingRepo.deleteByUsername(dto.username);

      const verificationToken = randomBytes(32).toString('hex');
      const verificationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.pendingRepo.create({
        email,
        username: dto.username,
        passwordHash,
        firstName,
        lastName,
        role: 'EDUCATOR',
        acceptedTermsContractId: dto.acceptedEducatorContractId ?? null,
        acceptedPrivacyContractId: dto.acceptedPrivacyContractId ?? null,
        verificationToken,
        verificationTokenExpiresAt,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        tenantId: getDefaultTenantId(),
        cvUrl: dto.cvUrl ?? null,
        specializations: dto.specializations ?? [],
        educationInfo: dto.educationInfo ?? null,
        bio: dto.bio ?? null,
        linkedinUrl: dto.linkedinUrl?.trim() ? dto.linkedinUrl.trim() : null,
        websiteUrl: dto.websiteUrl?.trim() ? dto.websiteUrl.trim() : null,
      });

      return { message: 'Doğrulama maili gönderildi', email };
    }

    // Fallback: eski davranış (pendingRepo DI verilmemişse)
    const user = {
      id: randomUUID(),
      email,
      username: dto.username,
      passwordHash,
      role: 'EDUCATOR' as const,
      status: 'PENDING_EDUCATOR_APPROVAL' as const,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const saved = await this.userRepo.save(user);

    await (prisma as any).user.update({
      where: { id: saved.id },
      data: { firstName, lastName },
    });

    // Acceptance kayıtları
    for (const contract of [educatorContract, privacyContract]) {
      const existingAcceptance = await this.acceptanceRepo.findByUserAndContract(saved.id, contract.id);
      if (!existingAcceptance) {
        await this.acceptanceRepo.create({
          userId: saved.id,
          contractId: contract.id,
          ip: ctx?.ip,
          userAgent: ctx?.userAgent,
        });
        try {
          await this.auditRepo.create({
            action: 'CONTRACT_ACCEPTED',
            entityType: 'CONTRACT',
            entityId: contract.id,
            actorId: saved.id,
            metadata: { during: 'register', role: 'EDUCATOR', type: contract.type },
          });
        } catch {
          /* best-effort */
        }
      }
    }

    // Fallback: eski shape (user + token) döndür — backward compat
    const sid = randomUUID();
    await prisma.user.update({
      where: { id: saved.id },
      data: { activeSessionId: sid } as any,
    });
    const token = this.jwtService.sign({ sub: saved.id, email: saved.email, role: saved.role, sid });
    const userPublic = {
      id: saved.id,
      email: saved.email,
      username: saved.username,
      role: saved.role,
      status: saved.status,
      createdAt: saved.createdAt,
    };
    return { user: userPublic, token, message: 'Kullanıcı oluşturuldu', email: saved.email } as any;
  }
}
