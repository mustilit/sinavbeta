// @ts-nocheck
import { z } from 'zod';

const envSchema = z.object({
  DOCKER: z.string().optional(),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  REDIS_DISABLED: z.string().optional(),
});

function isLocalhost(host?: string) {
  return host === '127.0.0.1' || host === 'localhost';
}

export function isRedisDisabled() {
  const env = envSchema.parse(process.env);
  return env.REDIS_DISABLED === '1' || env.REDIS_DISABLED === 'true';
}

export function getRedisUrl(): string {
  const env = envSchema.parse(process.env);

  // If REDIS_URL is provided but empty, treat as invalid (fail-fast) rather than
  // silently falling back to host/port defaults.
  if (typeof env.REDIS_URL === 'string' && env.REDIS_URL.trim().length === 0) {
    // eslint-disable-next-line no-console
    console.error('[Redis] Invalid config: REDIS_URL is set but empty.');
    process.exit(1);
  }

  if (env.REDIS_URL && env.REDIS_URL.trim().length > 0) return env.REDIS_URL.trim();

  const port = env.REDIS_PORT ?? '6379';

  const host =
    env.REDIS_HOST ??
    (env.DOCKER === '1' ? 'redis' : '127.0.0.1');

  return `redis://${host}:${port}`;
}

export function validateRedisUrl(): void {
  const env = envSchema.parse(process.env);
  const url = getRedisUrl(); // already fail-fast for empty REDIS_URL

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // eslint-disable-next-line no-console
    console.error('[Redis] Invalid config: REDIS_URL is not a valid URL.');
    process.exit(1);
  }

  const host = parsed.hostname;

  if (env.DOCKER === '1' && isLocalhost(host)) {
    // eslint-disable-next-line no-console
    console.error(
      `[Redis] Invalid config: DOCKER=1 but redis host is "${host}". Use "redis" service name (redis://redis:6379).`,
    );
    process.exit(1);
  }

  if (env.DOCKER !== '1' && host === 'redis') {
    // eslint-disable-next-line no-console
    console.error(
      `[Redis] Invalid config: local run but redis host is "redis". Use localhost/127.0.0.1 or set DOCKER=1.`,
    );
    process.exit(1);
  }
}

export function validateRedisEnv() {
  // Backwards-compatible name used by bootstrap.
  if (isRedisDisabled()) return;
  validateRedisUrl();
}

export function getRedisConnectionOptions(): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
} {
  const url = getRedisUrl();
  const parsed = new URL(url);
  const port = parsed.port ? Number(parsed.port) : 6379;

  const pathname = parsed.pathname?.trim() ?? '';
  const dbRaw = pathname && pathname !== '/' ? pathname.replace(/^\//, '') : '';
  const db = dbRaw ? Number(dbRaw) : undefined;

  const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;

  return {
    host: parsed.hostname,
    port: Number.isFinite(port) ? port : 6379,
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
    ...(typeof db === 'number' && Number.isFinite(db) ? { db } : {}),
  };
}



