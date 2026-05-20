// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

/** Public payment settings — frontend'in provider listesi ve test modu için */
export class GetPaymentSettingsUseCase {
  async execute() {
    const s = await (prisma as any).paymentSettings.findFirst({ where: { id: 1 } });
    return {
      mode: s?.mode ?? 'test',
      iyzicoEnabled: s?.iyzicoEnabled ?? true,
      googlePayEnabled: s?.googlePayEnabled ?? true,
      amazonPayEnabled: s?.amazonPayEnabled ?? true,
      companyName: s?.companyName ?? 'Sinav Salonu',
    };
  }
}
