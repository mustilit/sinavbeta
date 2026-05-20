/**
 * Küçük, saf DB işlemlerini (Prisma query/transaction) retry etmek için helper.
 *
 * DIKKAT:
 * - Sadece veri tabanı çağrılarını sarmalayın.
 * - Ödeme API'leri, mail gönderimi, webhook gibi "yan etkili" dış servisleri
 *   ASLA bu helper içine koymayın.
 */
// @ts-nocheck

export async function prismaRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      if (err?.code === 'P1001' || err?.code === 'P1008') {
        await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

