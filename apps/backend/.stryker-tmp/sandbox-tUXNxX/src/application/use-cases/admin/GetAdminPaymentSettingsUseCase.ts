// @ts-nocheck
import { prisma } from '../../../infrastructure/database/prisma';

/**
 * Admin tarafı ödeme ayarları — API anahtarları dahil tüm alanlar döner.
 * Yalnızca ADMIN rolüne açık endpoint'te kullanılır.
 */
export class GetAdminPaymentSettingsUseCase {
  async execute() {
    const s = await (prisma as any).paymentSettings.findFirst({ where: { id: 1 } });
    return {
      mode:               s?.mode                ?? 'test',
      // iyzico
      iyzicoEnabled:      s?.iyzicoEnabled       ?? true,
      iyzicoApiKey:       s?.iyzicoApiKey        ?? '',
      iyzicoSecretKey:    s?.iyzicoSecretKey     ?? '',
      iyzicoBaseUrl:      s?.iyzicoBaseUrl       ?? 'https://sandbox-api.iyzipay.com',
      // Google Pay
      googlePayEnabled:   s?.googlePayEnabled    ?? true,
      googlePayMerchantId: s?.googlePayMerchantId ?? '',
      // Amazon Pay
      amazonPayEnabled:   s?.amazonPayEnabled    ?? true,
      amazonPayMerchantId: s?.amazonPayMerchantId ?? '',
      // Firma
      companyName:        s?.companyName         ?? '',
      companyTaxId:       s?.companyTaxId        ?? '',
      companyAddress:     s?.companyAddress      ?? '',
    };
  }
}
