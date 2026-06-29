import { describe, it, expect, vi } from 'vitest';
import { collectAllNotes } from '@/lib/notesPdf';

describe('collectAllNotes — pageSize 100 ile tüm sayfaları toplar', () => {
  it('çok sayfa: 100 + 50 = 150 (DTO max 100 sınırına takılmaz)', async () => {
    const listFn = vi.fn()
      .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, i) => ({ id: i })), total: 150 })
      .mockResolvedValueOnce({ items: Array.from({ length: 50 }, (_, i) => ({ id: 100 + i })), total: 150 });
    const all = await collectAllNotes(listFn, { q: 'x' });
    expect(all).toHaveLength(150);
    expect(listFn).toHaveBeenNthCalledWith(1, { q: 'x', page: 1, pageSize: 100 });
    expect(listFn).toHaveBeenNthCalledWith(2, { q: 'x', page: 2, pageSize: 100 });
  });

  it('tek sayfa (100 altı) → tek çağrı', async () => {
    const listFn = vi.fn().mockResolvedValue({ items: [{ id: 1 }, { id: 2 }], total: 2 });
    const all = await collectAllNotes(listFn);
    expect(all).toHaveLength(2);
    expect(listFn).toHaveBeenCalledTimes(1);
  });

  it('boş liste → boş dizi, tek çağrı', async () => {
    const listFn = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const all = await collectAllNotes(listFn);
    expect(all).toEqual([]);
    expect(listFn).toHaveBeenCalledTimes(1);
  });
});
