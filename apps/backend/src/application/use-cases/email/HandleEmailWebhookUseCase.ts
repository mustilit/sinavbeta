import {
  BrevoWebhookEvent,
  EmailWebhookProcessor,
  getEmailWebhookProcessor,
} from '../../services/email/workers/EmailWebhookProcessor';

export class HandleEmailWebhookUseCase {
  constructor(private readonly processor: EmailWebhookProcessor = getEmailWebhookProcessor()) {}

  async execute(input: {
    tenantId: string;
    secret: string;
    payload: BrevoWebhookEvent | BrevoWebhookEvent[];
  }) {
    return this.processor.handleBrevo(input);
  }
}
