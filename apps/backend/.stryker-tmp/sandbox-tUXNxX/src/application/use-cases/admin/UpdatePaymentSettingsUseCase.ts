// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

export class UpdatePaymentSettingsUseCase {
  async execute(data: {
    mode?: string;
    iyzicoEnabled?: boolean;
    iyzicoApiKey?: string;
    iyzicoSecretKey?: string;
    googlePayEnabled?: boolean;
    googlePayMerchantId?: string;
    amazonPayEnabled?: boolean;
    amazonPayMerchantId?: string;
    companyName?: string;
    companyTaxId?: string;
    companyAddress?: string;
  }) {
    const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    return (prisma as any).paymentSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...filtered },
      update: filtered,
    });
  }
}
