// @ts-nocheck
import IORedis from 'ioredis';
import { getRedisUrl, isRedisDisabled } from '../../config/redis';

type Counter = { count: number; expiresAt: number };

const memoryStore = new Map<string, Counter>();

let redisClient: IORedis | null = null;

function getRedisClient(): IORedis | null {
  if (isRedisDisabled()) return null;
  if (!redisClient) {
    redisClient = new IORedis(getRedisUrl(), {
      maxRetriesPerRequest: 2,
    });
  }
  return redisClient;
}

/**
 * Sayacın mevcut değerini artırmadan döndürür.
 * Guard'da "artırmadan önce kontrol" akışı için kullanılır.
 */
export async function getCount(key: string): Promise<number> {
  const client = getRedisClient();
  if (client) {
    try {
      const val = await client.get(key);
      return val ? parseInt(val, 10) || 0 : 0;
    } catch {
      // Redis hatası — in-memory fallback
    }
  }
  const now = Date.now();
  const existing = memoryStore.get(key);
  if (!existing || existing.expiresAt <= now) return 0;
  return existing.count;
}

/**
 * Sayacı siler (örn. başarılı giriş sonrası brute-force sayacını sıfırlamak için).
 * Redis varsa Redis'ten, her durumda in-memory store'dan siler.
 */
export async function delKey(key: string): Promise<void> {
  memoryStore.delete(key);
  const client = getRedisClient();
  if (client) {
    try {
      await client.del(key);
    } catch {
      // Redis hatası — in-memory zaten silindi, yeterli
    }
  }
}

/**
 * Basit rate-limit sayacı. Her çağrıda sayacı 1 arttırır ve TTL dolunca sıfırlar.
 * Redis varsa Redis, bağlanamıyorsa in-memory fallback kullanır.
 */
export async function incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
  const ttl = Math.max(1, ttlSeconds | 0);
  const client = getRedisClient();
  if (client) {
    try {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, ttl);
      }
      return count;
    } catch (err: any) {
      // Redis bağlantı hatası — in-memory fallback'e geç; login işlemini engelleme
      console.warn('[rate-limit] Redis hatası, in-memory fallback devreye giriyor:', err?.message);
    }
  }

  const now = Date.now();
  const existing = memoryStore.get(key);
  if (!existing || existing.expiresAt <= now) {
    const counter: Counter = { count: 1, expiresAt: now + ttl * 1000 };
    memoryStore.set(key, counter);
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

