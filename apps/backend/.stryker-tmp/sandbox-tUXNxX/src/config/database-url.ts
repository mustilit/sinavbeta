// @ts-nocheck
import { env } from './env';

function parseHost(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname || null;
  } catch {
    return null;
  }
}

export function withPrismaConnectionLimit(url: string): string {
  const parsed = new URL(url);

  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '5');
  }

  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', '10');
  }

  return parsed.toString();
}

export function validateDatabaseUrl() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  // Connection limit / pool timeout default'larını ekle
  process.env.DATABASE_URL = withPrismaConnectionLimit(env.DATABASE_URL);

  // Production ortamında sadece boş olmamasını garanti ediyoruz (platform spesifik kurallar dışarıda yönetilir)
  if (env.NODE_ENV === 'production') {
    return;
  }

  const host = parseHost(process.env.DATABASE_URL);
  const inDocker = process.env.DOCKER === '1';

  if (!host) {
    throw new Error(`DATABASE_URL is not a valid URL: ${process.env.DATABASE_URL}`);
  }

  if (inDocker && host === 'localhost') {
    // Container içindeyken localhost genelde yanlış; Docker network host adını kullanmak gerekir
    // Örn: postgresql://...@postgres:5432/...
    // Fail-fast:
    // eslint-disable-next-line no-console
    console.error('DATABASE_URL host=localhost but DOCKER=1 (container). Use "postgres" as host inside Docker.');
    process.exit(1);
  }

  if (!inDocker && host === 'postgres') {
    // Host makinede postgres host adı çözülmez; localhost kullanılmalı
    // eslint-disable-next-line no-console
    console.error('DATABASE_URL host=postgres but DOCKER is not set. Use "localhost" as host on the host machine.');
    process.exit(1);
  }
}

