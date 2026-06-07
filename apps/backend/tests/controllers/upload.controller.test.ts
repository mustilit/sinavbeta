/**
 * UploadController — yüklenen dosya URL'lerinin GÖRECELİ (host-bağımsız) olduğunu
 * doğrulayan regresyon testleri.
 *
 * BAĞLAM (178.105.231.185 olayı, 2026-06-07):
 *   Upload akışı eskiden `process.env.BACKEND_URL`'i yanıt URL'lerine gömüyordu.
 *   Host/IP/domain değişince DB'deki görsel/CV URL'leri kırıldı. Düzeltme: yanıtlar
 *   artık `/uploads/...` göreceli yolu döner.
 *
 * Bu test, BACKEND_URL set EDİLMİŞ olsa bile yanıtın hiçbir alanında scheme+host
 * (http(s)://) bulunmadığını kanıtlar — yani biri controller'da `baseUrl`'ü tekrar
 * BACKEND_URL'e bağlarsa test KIRILIR.
 *
 * processImage (Sharp) + dosya I/O mock'lanır; buildImageUrls GERÇEK kalır (controller'ın
 * ona ne base geçtiğini uçtan uca doğrulamak için).
 */

// Sharp pipeline'ı çağırma — fake ProcessedImage döndür.
jest.mock('../../src/application/services/image/ImageProcessor', () => {
  const actual = jest.requireActual('../../src/application/services/image/ImageProcessor');
  return {
    ...actual, // buildImageUrls GERÇEK
    processImage: jest.fn(async () => ({
      original: { label: 'original', filename: 'abc.png', width: 800, height: 600, format: 'png', bytes: 1000 },
      variants: [
        { label: '320w', filename: 'abc-320w.webp', width: 320, height: 240, format: 'webp', bytes: 50 },
        { label: '320w', filename: 'abc-320w.avif', width: 320, height: 240, format: 'avif', bytes: 40 },
        { label: '640w', filename: 'abc-640w.webp', width: 640, height: 480, format: 'webp', bytes: 80 },
        { label: '640w', filename: 'abc-640w.avif', width: 640, height: 480, format: 'avif', bytes: 70 },
        { label: '1024w', filename: 'abc-1024w.webp', width: 1024, height: 768, format: 'webp', bytes: 120 },
        { label: '1024w', filename: 'abc-1024w.avif', width: 1024, height: 768, format: 'avif', bytes: 100 },
        { label: 'thumb', filename: 'abc-thumb.webp', width: 96, height: 96, format: 'webp', bytes: 10 },
      ],
      meta: { width: 800, height: 600, format: 'png', bytes: 1000 },
    })),
  };
});

// Magic-byte doğrulamasını geç — her zaman PNG kabul et.
jest.mock('../../src/application/security/fileTypeDetection', () => ({
  validateImageUpload: jest.fn(() => ({
    ok: true,
    detected: { type: 'png', mimeType: 'image/png', extension: '.png' },
  })),
}));

jest.mock('../../src/application/security/clamavScan', () => ({
  isClean: jest.fn(async () => ({ clean: true })),
}));

// Disk yazma + import-time mkdir'i no-op yap (PDF yolu writeFileSync kullanır).
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return { ...actual, existsSync: jest.fn(() => true), mkdirSync: jest.fn(), writeFileSync: jest.fn() };
});

import { UploadController } from '../../src/nest/controllers/upload.controller';

const NO_HOST = /https?:\/\//; // mutlak URL işareti — olmamalı

describe('UploadController — göreceli (host-bağımsız) URL', () => {
  const controller = new UploadController();
  const ORIGINAL_BACKEND_URL = process.env.BACKEND_URL;

  beforeAll(() => {
    // En kritik guard: BACKEND_URL set olsa BİLE yanıta sızmamalı.
    process.env.BACKEND_URL = 'http://poison-host.example:9999';
    delete process.env.CLAMAV_ENABLED;
  });

  afterAll(() => {
    if (ORIGINAL_BACKEND_URL === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = ORIGINAL_BACKEND_URL;
  });

  it('uploadImage tüm URL alanlarını /uploads/ ile döner, host gömmez', async () => {
    const file: any = { buffer: Buffer.from('fake-png-bytes'), size: 1234, mimetype: 'image/png' };

    const res: any = await controller.uploadImage(file);

    expect(res.url).toBe('/uploads/abc.png');
    expect(res.responsive.thumb).toBe('/uploads/abc-thumb.webp');
    expect(res.responsive.srcsetWebp).toContain('/uploads/abc-320w.webp 320w');
    expect(res.responsive.srcsetAvif).toContain('/uploads/abc-320w.avif 320w');
    expect(res.variants[0].url).toMatch(/^\/uploads\//);

    // BACKEND_URL=poison-host olmasına rağmen hiçbir alanda scheme+host olmamalı.
    const allUrls = [
      res.url,
      res.responsive.thumb,
      res.responsive.srcset,
      res.responsive.srcsetWebp,
      res.responsive.srcsetAvif,
      ...res.variants.map((v: any) => v.url),
    ];
    for (const u of allUrls) {
      expect(u ?? '').not.toMatch(NO_HOST);
    }
  });

  it('uploadRegistrationCv (PDF) göreceli /uploads/*.pdf döner', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)]);
    const file: any = { buffer: pdf, size: pdf.length, mimetype: 'application/pdf' };

    const res: any = await controller.uploadRegistrationCv(file);

    expect(res.url).toMatch(/^\/uploads\/.*\.pdf$/);
    expect(res.url).not.toMatch(NO_HOST);
  });

  it('uploadDocument (PDF) göreceli /uploads/*.pdf döner', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
    const file: any = { buffer: pdf, size: pdf.length, mimetype: 'application/pdf' };

    const res: any = await controller.uploadDocument(file);

    expect(res.url).toMatch(/^\/uploads\/.*\.pdf$/);
    expect(res.url).not.toMatch(NO_HOST);
  });
});
