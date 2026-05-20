// @ts-nocheck
import { z } from 'zod';

/**
 * Ortam değişkenleri şeması — Zod ile doğrulanır.
 * Zorunlu: DATABASE_URL, JWT_SECRET
 * Opsiyonel özellik bayrakları: REDIS_DISABLED, CRON_DISABLED, THROTTLE_DISABLED
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  CLIENT_URL: z.string().optional(),          // CORS için izin verilen frontend URL'i
  PORT: z.string().optional(),                // HTTP sunucu portu (varsayılan 3000)
  REDIS_URL: z.string().optional(),           // Redis bağlantı URL'i; yoksa cache devre dışı
  REDIS_DISABLED: z.string().optional(),      // '1' ise Redis tamamen atlanır
  CRON_DISABLED: z.string().optional(),       // '1' ise zamanlanmış görevler çalışmaz
  THROTTLE_DISABLED: z.string().optional(),   // '1' ise rate limiting devre dışı (test için)
  TRUST_PROXY: z.string().optional(),         // Reverse proxy arkasında çalışıyorsa '1'
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Ortam değişkenlerini doğrular ve üretim güvenlik kontrollerini uygular.
 * Geliştirme ortamındaki zayıf JWT_SECRET veya eksik CLIENT_URL üretimde hata verir.
 */
function validateEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[env] Validation failed', parsed.error.flatten());
    throw new Error(`Environment validation failed: ${parsed.error.message}`);
  }

  const env = parsed.data;

  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set');
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  if (env.NODE_ENV === 'production') {
    const weakSecrets = new Set([
      'change_me',
      'super_secret_key',
      'your-secret-key-change-in-production',
      '"super_secret_key"',
    ]);
    if (env.JWT_SECRET.length < 32 || weakSecrets.has(env.JWT_SECRET)) {
      throw new Error('In production, JWT_SECRET must be at least 32 characters and not a default value');
    }

    if (!env.CLIENT_URL || !env.CLIENT_URL.trim()) {
      throw new Error('In production, CLIENT_URL is required');
    }

    if (!env.TRUST_PROXY || !env.TRUST_PROXY.trim()) {
      env.TRUST_PROXY = '1';
    }

    if (env.REDIS_DISABLED === '1') {
      throw new Error('In production, REDIS_DISABLED cannot be "1"');
    }

    if (env.PORT && env.PORT !== '3000') {
      // eslint-disable-next-line no-console
      console.warn(
        '[env] Warning: PORT is not 3000 in production. Ensure reverse proxy / load balancer configuration matches.',
      );
    }
  }

  return env;
}

export const env: Env = validateEnv(process.env);

