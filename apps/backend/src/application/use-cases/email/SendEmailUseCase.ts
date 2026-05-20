import { EmailLog } from '@prisma/client';
import { EmailService, SendEmailInput, getEmailService } from '../../services/email/EmailService';

/**
 * Public API — diğer Use Case'ler bunu çağırarak mail tetikler.
 * EmailService'in incelenebilir/test edilebilir bir sarmalayıcısı.
 */
export class SendEmailUseCase {
  constructor(private readonly service: EmailService = getEmailService()) {}

  async execute(input: SendEmailInput): Promise<EmailLog> {
    return this.service.send(input);
  }
}
