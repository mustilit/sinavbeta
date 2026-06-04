import { Logger } from '@nestjs/common';
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { AppError } from '../../errors/AppError';

/**
 * Oturum açmış kullanıcının mevcut şifresini doğrulayıp yeni şifre atar.
 * E-posta token akışından (ResetPassword) farklı: burada kullanıcı zaten
 * giriş yapmıştır ve mevcut şifresini bilerek değiştirir.
 *
 * Audit: AuditAction enum'unda parola değişimi için değer yok; security/forensic
 * görünürlüğü için structured Logger kullanılır (observability skill — enum
 * yokken structured log fallback). Enum genişletilince AuditLogger'a taşınabilir.
 */
export class ChangePasswordUseCase {
  private readonly logger = new Logger(ChangePasswordUseCase.name);

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'Oturum bulunamadı', 401);
    }
    if (!currentPassword || !newPassword) {
      throw new AppError('INVALID_INPUT', 'Mevcut ve yeni şifre zorunludur', 400);
    }
    // Minimum güvenlik politikası — ResetPasswordUseCase ile aynı eşik
    if (newPassword.length < 8) {
      throw new AppError('PASSWORD_TOO_SHORT', 'Yeni şifre en az 8 karakter olmalı', 400);
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'Kullanıcı bulunamadı', 404);
    }

    const matches = await this.passwordService.compare(currentPassword, user.passwordHash);
    if (!matches) {
      // Başarısız deneme görünür olmalı (brute-force / forensic sinyali)
      this.logger.warn(`auth.password.change_fail user=${userId} reason=current_password_mismatch`);
      throw new AppError('INVALID_CURRENT_PASSWORD', 'Mevcut şifre hatalı', 400);
    }

    if (currentPassword === newPassword) {
      throw new AppError('SAME_PASSWORD', 'Yeni şifre mevcut şifre ile aynı olamaz', 400);
    }

    const newHash = await this.passwordService.hash(newPassword);
    await this.userRepo.resetPassword(user.id, newHash);

    this.logger.log(`auth.password.changed user=${userId}`);
  }
}
