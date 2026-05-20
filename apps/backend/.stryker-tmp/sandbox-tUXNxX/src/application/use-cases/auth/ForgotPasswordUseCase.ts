// @ts-nocheck
import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { IEmailProvider } from '../../../domain/interfaces/IEmailProvider';
import { randomBytes } from 'crypto';

export class ForgotPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly emailProvider: IEmailProvider,
  ) {}

  async execute(email: string): Promise<void> {
    // Always return success (don't reveal if email exists)
    const user = await this.userRepo.findByEmail(email.trim().toLowerCase());
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userRepo.setPasswordResetToken(user.id, token, expiresAt);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}?page=ResetPassword&token=${token}`;

    await this.emailProvider.sendEmail(
      user.email,
      'Şifre Sıfırlama Talebi — Sınav Salonu',
      `Merhaba ${user.username},\n\nŞifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:\n\n${resetLink}\n\nBu bağlantı 1 saat geçerlidir.\n\nEğer bu talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.\n\nSınav Salonu Ekibi`,
    );
  }
}
