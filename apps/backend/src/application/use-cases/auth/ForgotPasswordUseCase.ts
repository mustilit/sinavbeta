import { IUserRepository } from '../../../domain/interfaces/IUserRepository';
import { IEmailProvider } from '../../../domain/interfaces/IEmailProvider';
import { randomBytes } from 'crypto';
import { SendEmailUseCase } from '../email/SendEmailUseCase';
import { getDefaultTenantId } from '../../../common/tenant';

export class ForgotPasswordUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly emailProvider: IEmailProvider,
    private readonly sendEmail?: SendEmailUseCase,
  ) {}

  async execute(email: string): Promise<void> {
    // Always return success (don't reveal if email exists)
    const user = await this.userRepo.findByEmail(email.trim().toLowerCase());
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userRepo.setPasswordResetToken(user.id, token, expiresAt);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}?page=ResetPassword&token=${token}`;

    if (this.sendEmail) {
      // Yeni email modülü — şablon + kuyruk + log
      await this.sendEmail.execute({
        tenantId: getDefaultTenantId(),
        templateKey: 'password-reset',
        to: { userId: user.id, email: user.email, role: user.role },
        data: { user: { username: user.username }, resetUrl, currentYear: new Date().getFullYear() },
      });
      return;
    }

    // Geriye dönük: yeni sistem inject edilmediyse mevcut akış
    await this.emailProvider.sendEmail(
      user.email,
      'Şifre Sıfırlama Talebi — Sınav Salonu',
      `Merhaba ${user.username},\n\nŞifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:\n\n${resetUrl}\n\nBu bağlantı 1 saat geçerlidir.\n\nEğer bu talebi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.\n\nSınav Salonu Ekibi`,
    );
  }
}
