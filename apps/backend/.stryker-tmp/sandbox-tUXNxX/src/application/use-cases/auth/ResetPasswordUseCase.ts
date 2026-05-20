// @ts-nocheck
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { PasswordService } from '../../../infrastructure/services/PasswordService';
import { AppError } from '../../errors/AppError';

/**
 * Parola sıfırlama e-postasındaki token ile yeni parola atar.
 * Token süresi dolmuşsa veya geçersizse işlem reddedilir.
 * Başarılı işlem sonrası token veritabanından temizlenir.
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async execute(token: string, newPassword: string): Promise<void> {
    // Şifre en az 8 karakter olmalı — minimum güvenlik politikası
    if (!token || !newPassword || newPassword.length < 8) {
      throw new AppError('INVALID_INPUT', 'Geçersiz token veya şifre çok kısa (en az 8 karakter)', 400);
    }

    const user = await this.userRepo.findByPasswordResetToken(token);
    if (!user) throw new AppError('INVALID_TOKEN', 'Geçersiz veya süresi dolmuş bağlantı', 400);

    // Token süresi kontrolü — token oluşturulduktan sonra belirli süre geçerliydi
    const expiresAt = (user as any).passwordResetTokenExpiresAt as Date | null;
    if (!expiresAt || expiresAt < new Date()) {
      throw new AppError('TOKEN_EXPIRED', 'Bağlantının süresi dolmuş. Yeni bir sıfırlama talebi oluşturun.', 400);
    }

    const newHash = await this.passwordService.hash(newPassword);
    await this.userRepo.resetPassword(user.id, newHash);
  }
}
