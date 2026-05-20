import Redis from 'ioredis';
import { getRedisUrl, isRedisDisabled } from '../../config/redis';

export class RedisCache {
  private client?: Redis;
  constructor() {
    if (isRedisDisabled()) return;
    const url = getRedisUrl();
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
    this.client.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[REDIS] client error', err);
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    const v = await this.client.get(key);
    if (!v) return null;
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds = 600) {
    if (!this.client) return;
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /**
   * Atomic SET NX EX — sadece key yoksa yazar. Idempotency lock için.
   * @returns true: yazıldı, false: zaten var (lock alınamadı)
   * Redis devre dışıyken her zaman true döner (fail-open, lock yok demek olur).
   */
  async setIfNotExists(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    if (!this.client) return true;
    const res = await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  async quit() {
    if (!this.client) return;
    await this.client.quit();
  }

  async del(key: string) {
    if (!this.client) return;
    await this.client.del(key);
  }

  async delByPrefix(prefix: string): Promise<number> {
    if (!this.client) return 0;
    let cursor = '0';
    let total = 0;
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length) {
        const res = await this.client.del(...keys);
        total += res;
      }
    } while (cursor !== '0');
    return total;
  }

  async ping(): Promise<string | null> {
    if (!this.client) return null;
    return this.client.ping();
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

