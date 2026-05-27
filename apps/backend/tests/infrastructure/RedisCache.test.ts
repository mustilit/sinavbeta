/**
 * RedisCache unit testleri.
 * ioredis client mock'lanır — gerçek Redis gerekmez.
 */

// REDIS_DISABLED=1 setup.ts'de set edilmiş — RedisCache client oluşturmaz.
// Burada ENABLED davranışını test etmek için override yapıyoruz.
jest.mock('../../src/config/redis', () => ({
  getRedisUrl: () => 'redis://localhost:6379',
  isRedisDisabled: jest.fn().mockReturnValue(false),
}));

jest.mock('ioredis', () => {
  const mockClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
    ping: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
  };
  return jest.fn().mockImplementation(() => mockClient);
});

import Redis from 'ioredis';
import { RedisCache } from '../../src/infrastructure/cache/RedisCache';

const MockRedis = Redis as jest.MockedClass<typeof Redis>;

describe('RedisCache', () => {
  let cache: RedisCache;
  let mockClient: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new RedisCache();
    mockClient = (MockRedis as any).mock.results[0].value;
  });

  // --- get ---

  describe('get', () => {
    it('kayıt varsa JSON parse edip döner', async () => {
      // Arrange
      mockClient.get.mockResolvedValueOnce(JSON.stringify({ userId: 'u-1' }));

      // Act
      const result = await cache.get<{ userId: string }>('key-1');

      // Assert
      expect(result).toEqual({ userId: 'u-1' });
    });

    it('kayıt yoksa null döner', async () => {
      mockClient.get.mockResolvedValueOnce(null);
      const result = await cache.get('missing-key');
      expect(result).toBeNull();
    });

    it('bozuk JSON null döner ve hata fırlatmaz', async () => {
      mockClient.get.mockResolvedValueOnce('{invalid-json}');
      const result = await cache.get('bad-json');
      expect(result).toBeNull();
    });
  });

  // --- set ---

  describe('set', () => {
    it('değeri JSON olarak TTL ile saklar', async () => {
      mockClient.set.mockResolvedValueOnce('OK');
      await cache.set('key-1', { data: 42 }, 300);
      expect(mockClient.set).toHaveBeenCalledWith('key-1', JSON.stringify({ data: 42 }), 'EX', 300);
    });

    it('TTL belirtilmezse default 600 saniye kullanılır', async () => {
      mockClient.set.mockResolvedValueOnce('OK');
      await cache.set('key-2', 'value');
      expect(mockClient.set).toHaveBeenCalledWith('key-2', '"value"', 'EX', 600);
    });
  });

  // --- setIfNotExists ---

  describe('setIfNotExists', () => {
    it('başarılı SET NX → true döner', async () => {
      mockClient.set.mockResolvedValueOnce('OK');
      const result = await cache.setIfNotExists('lock-key', 'locked', 60);
      expect(result).toBe(true);
    });

    it('anahtar zaten varsa null döner → false döner', async () => {
      mockClient.set.mockResolvedValueOnce(null);
      const result = await cache.setIfNotExists('existing-key', 'value', 60);
      expect(result).toBe(false);
    });
  });

  // --- del ---

  describe('del', () => {
    it('anahtarı siler', async () => {
      mockClient.del.mockResolvedValueOnce(1);
      await cache.del('my-key');
      expect(mockClient.del).toHaveBeenCalledWith('my-key');
    });
  });

  // --- delByPrefix ---

  describe('delByPrefix', () => {
    it('prefix ile eşleşen anahtarları tarar ve siler', async () => {
      // Arrange — tek sayfa tarama
      mockClient.scan.mockResolvedValueOnce(['0', ['prefix:a', 'prefix:b']]);
      mockClient.del.mockResolvedValueOnce(2);

      // Act
      const deleted = await cache.delByPrefix('prefix:');

      // Assert
      expect(deleted).toBe(2);
      expect(mockClient.del).toHaveBeenCalledWith('prefix:a', 'prefix:b');
    });

    it('eşleşen anahtar yoksa 0 döner', async () => {
      mockClient.scan.mockResolvedValueOnce(['0', []]);
      const deleted = await cache.delByPrefix('empty:');
      expect(deleted).toBe(0);
    });
  });

  // --- ping ---

  describe('ping', () => {
    it('PONG cevabını döner', async () => {
      mockClient.ping.mockResolvedValueOnce('PONG');
      const result = await cache.ping();
      expect(result).toBe('PONG');
    });
  });
});
