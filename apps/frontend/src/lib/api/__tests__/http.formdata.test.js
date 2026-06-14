/**
 * Regresyon: FormData gönderiminde Content-Type ASLA elle gönderilmemeli.
 * Çağıran taraf yanlışlıkla "multipart/form-data" (boundary'siz) geçse bile http.js
 * bunu temizlemeli — aksi halde browser boundary eklemez, multer parse edemez,
 * dosya kaybolur ("Görsel yüklenemedi" bug'ı, 2026-06-15).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiPost } from '../http';

function mockOkResponse(jsonBody = { ok: true }) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    text: async () => JSON.stringify(jsonBody),
  };
}

describe('http apiPost — FormData Content-Type', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => mockOkResponse());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('FormData + elle verilen multipart/form-data header → Content-Type TEMİZLENİR (boundary için)', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png');

    await apiPost('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, opts] = global.fetch.mock.calls[0];
    const headerKeys = Object.keys(opts.headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('content-type');
    // Body olduğu gibi FormData kalmalı (JSON.stringify edilmemeli)
    expect(opts.body).toBeInstanceOf(FormData);
  });

  it('FormData (header verilmeden) → Content-Type yok', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'a.png');
    await apiPost('/upload/image', fd);
    const [, opts] = global.fetch.mock.calls[0];
    const headerKeys = Object.keys(opts.headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('content-type');
  });

  it('JSON gövde → Content-Type application/json kalır', async () => {
    await apiPost('/some/endpoint', { a: 1 });
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.body).toBe(JSON.stringify({ a: 1 }));
  });
});
