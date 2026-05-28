/**
 * ImageProcessor — Sharp tabanlı responsive image pipeline testleri.
 *
 * Sprint 11 #2.
 *
 * Stratejisi:
 *   - Test fixture'ları Sharp ile runtime'da üretiyoruz (test git ignore).
 *   - tmpdir() altında izole bir output dir kullanıyoruz — paralel test güvenli.
 *   - Sharp varsayılan olarak native deniyor; CI'da prebuilt binary çekilir.
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import {
  processImage,
  buildImageUrls,
  RESPONSIVE_WIDTHS,
  THUMBNAIL_SIZE,
} from '../../src/application/services/image/ImageProcessor';
import type { DetectedFile } from '../../src/application/security/fileTypeDetection';

const JPEG: DetectedFile = { type: 'jpeg', mimeType: 'image/jpeg', extension: '.jpg' };
const PNG: DetectedFile = { type: 'png', mimeType: 'image/png', extension: '.png' };
const WEBP: DetectedFile = { type: 'webp', mimeType: 'image/webp', extension: '.webp' };
const GIF: DetectedFile = { type: 'gif', mimeType: 'image/gif', extension: '.gif' };

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'image-processor-test-'));
});

afterEach(() => {
  if (outputDir && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

/** 2000x1500 düz renk JPEG üretir — responsive küçültme için yeterli. */
async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 2000,
      height: 1500,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function makePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 4,
      background: { r: 200, g: 50, b: 50, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function makeWebp(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1500,
      height: 1000,
      channels: 3,
      background: { r: 50, g: 200, b: 100 },
    },
  })
    .webp({ quality: 85 })
    .toBuffer();
}

async function makeSmallJpeg(): Promise<Buffer> {
  // 200x150 — RESPONSIVE_WIDTHS[0]=320'den küçük; withoutEnlargement test eder.
  return sharp({
    create: {
      width: 200,
      height: 150,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('processImage — JPEG', () => {
  it('origin + 3 responsive (WebP+AVIF) + thumbnail üretir', async () => {
    const buf = await makeJpeg();
    const result = await processImage(buf, {
      outputDir,
      baseSlug: 'test-jpeg',
      detected: JPEG,
    });

    // Origin
    expect(result.original.filename).toBe('test-jpeg.jpg');
    expect(result.original.format).toBe('jpeg');
    expect(result.original.width).toBe(2000);
    expect(result.original.height).toBe(1500);
    expect(existsSync(join(outputDir, 'test-jpeg.jpg'))).toBe(true);

    // 3 width × 2 format (WebP + AVIF) + 1 thumb (sadece WebP) = 7 variant
    expect(result.variants).toHaveLength(RESPONSIVE_WIDTHS.length * 2 + 1);

    for (const w of RESPONSIVE_WIDTHS) {
      // WebP varyant
      const webp = result.variants.find((x) => x.label === `${w}w` && x.format === 'webp');
      expect(webp).toBeDefined();
      expect(webp!.width).toBe(w);
      expect(webp!.filename).toBe(`test-jpeg-${w}w.webp`);
      expect(existsSync(join(outputDir, webp!.filename))).toBe(true);
      expect(webp!.bytes).toBeGreaterThan(0);

      // AVIF varyant (Sprint 12 #2)
      const avif = result.variants.find((x) => x.label === `${w}w` && x.format === 'avif');
      expect(avif).toBeDefined();
      expect(avif!.width).toBe(w);
      expect(avif!.filename).toBe(`test-jpeg-${w}w.avif`);
      expect(existsSync(join(outputDir, avif!.filename))).toBe(true);
      expect(avif!.bytes).toBeGreaterThan(0);
    }

    // Thumbnail kare, sadece WebP (AVIF küçük boyutta avantaj sağlamıyor)
    const thumb = result.variants.find((x) => x.label === 'thumb');
    expect(thumb).toBeDefined();
    expect(thumb!.width).toBe(THUMBNAIL_SIZE);
    expect(thumb!.height).toBe(THUMBNAIL_SIZE);
    expect(thumb!.format).toBe('webp');
  });

  it('responsive varyantların gerçek genişliği fixture büyüklüğünü aşmaz', async () => {
    const buf = await makeSmallJpeg();
    const result = await processImage(buf, {
      outputDir,
      baseSlug: 'small',
      detected: JPEG,
    });

    // 200x150 fixture: 320w/640w/1024w'ye büyütmemeli (withoutEnlargement: true)
    for (const v of result.variants.filter((x) => x.label !== 'thumb')) {
      expect(v.width).toBeLessThanOrEqual(200);
    }
  });

  it('EXIF strip — çıktıda EXIF blok kalmaz', async () => {
    // Sharp synthetic `create` kaynağı EXIF tag taşımaz; bunun yerine kullanıcı-
    // tarafından gelen EXIF içerikli JPEG'i çoğunlukla görüyoruz. Burada `rotate()`
    // + default strip davranışını verifiye ediyoruz: çıktıdaki orientation
    // undefined olmalı (6 veya başka değer değil).
    const buf = await sharp({
      create: {
        width: 1000,
        height: 800,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const result = await processImage(buf, {
      outputDir,
      baseSlug: 'rotated',
      detected: JPEG,
    });

    const originBuf = readFileSync(join(outputDir, 'rotated.jpg'));
    const meta = await sharp(originBuf).metadata();
    // orientation strip edilmeli: undefined ya da 1 (normal) olabilir, ama 6 OLMAMALI.
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
    // Boyut korunur (synthetic input EXIF tag taşımadığında rotate no-op).
    expect(result.original.width).toBeGreaterThan(0);
    expect(result.original.height).toBeGreaterThan(0);
  });
});

describe('processImage — PNG', () => {
  it('origin PNG + WebP responsive varyantlar', async () => {
    const buf = await makePng();
    const result = await processImage(buf, {
      outputDir,
      baseSlug: 'test-png',
      detected: PNG,
    });

    expect(result.original.filename).toBe('test-png.png');
    expect(result.original.format).toBe('png');

    // Varyantlar WebP — orijinal PNG kalır
    const v640 = result.variants.find((x) => x.label === '640w');
    expect(v640!.format).toBe('webp');
    expect(v640!.filename).toBe('test-png-640w.webp');
  });
});

describe('processImage — WebP', () => {
  it('origin WebP + responsive WebP + AVIF varyantları', async () => {
    const buf = await makeWebp();
    const result = await processImage(buf, {
      outputDir,
      baseSlug: 'test-webp',
      detected: WEBP,
    });

    expect(result.original.filename).toBe('test-webp.webp');
    expect(result.original.format).toBe('webp');

    // 3 width × 2 format + 1 thumb = 7 variant
    expect(result.variants.length).toBe(RESPONSIVE_WIDTHS.length * 2 + 1);
    expect(result.variants.some((v) => v.format === 'avif')).toBe(true);
    expect(result.variants.some((v) => v.format === 'webp')).toBe(true);
  });
});

describe('processImage — GIF', () => {
  it('GIF pass-through, hiç varyant üretmez', async () => {
    // Tek karelik küçük GIF üretelim (sharp doğal GIF encode etmez,
    // bunu pass-through testi için raw buffer'la simüle ediyoruz).
    // Geçerli GIF89a header + en küçük image data.
    const tinyGif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
      0x01, 0x00, 0x01, 0x00, // 1x1
      0x80, 0x00, 0x00, // GCT flags + bg + aspect
      0x00, 0x00, 0x00, 0xff, 0xff, 0xff, // 2-color palette
      0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, // graphic control
      0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // image desc
      0x02, 0x02, 0x44, 0x01, 0x00, // image data
      0x3b, // trailer
    ]);

    const result = await processImage(tinyGif, {
      outputDir,
      baseSlug: 'tiny',
      detected: GIF,
    });

    expect(result.original.filename).toBe('tiny.gif');
    expect(result.variants).toHaveLength(0);
    expect(existsSync(join(outputDir, 'tiny.gif'))).toBe(true);
    // Origin byte-equal: GIF değişmeden kopyalandı
    expect(readFileSync(join(outputDir, 'tiny.gif'))).toEqual(tinyGif);
  });
});

describe('processImage — bozuk dosya', () => {
  it('decode hatasında atılır (caller controller 400 mapper)', async () => {
    // JPEG magic byte'la başlayan ama gövdesi bozuk buffer.
    const broken = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    await expect(
      processImage(broken, { outputDir, baseSlug: 'bad', detected: JPEG }),
    ).rejects.toThrow();
  });
});

describe('buildImageUrls', () => {
  it('srcsetWebp + srcsetAvif + thumb URL\'lerini doğru üretir', async () => {
    const buf = await makeJpeg();
    const result = await processImage(buf, {
      outputDir,
      baseSlug: 'urlgen',
      detected: JPEG,
    });

    const urls = buildImageUrls(result, 'https://cdn.example.com');

    expect(urls.original).toBe('https://cdn.example.com/uploads/urlgen.jpg');
    expect(urls.thumb).toBe('https://cdn.example.com/uploads/urlgen-thumb.webp');

    // WebP srcset
    expect(urls.srcsetWebp).toContain('/uploads/urlgen-320w.webp 320w');
    expect(urls.srcsetWebp).toContain('/uploads/urlgen-640w.webp 640w');
    expect(urls.srcsetWebp).toContain('/uploads/urlgen-1024w.webp 1024w');

    // AVIF srcset (Sprint 12 #2)
    expect(urls.srcsetAvif).toContain('/uploads/urlgen-320w.avif 320w');
    expect(urls.srcsetAvif).toContain('/uploads/urlgen-640w.avif 640w');
    expect(urls.srcsetAvif).toContain('/uploads/urlgen-1024w.avif 1024w');

    // Geriye dönük uyumluluk: `srcset` === `srcsetWebp`
    expect(urls.srcset).toBe(urls.srcsetWebp);

    expect(urls.sizes).toMatch(/max-width.*640px/);
    expect(urls.width).toBe(2000);
    expect(urls.height).toBe(1500);
  });

  it('GIF için thumb null, srcsetWebp ve srcsetAvif boş', async () => {
    const tinyGif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
      0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
      0x44, 0x01, 0x00, 0x3b,
    ]);
    const result = await processImage(tinyGif, {
      outputDir,
      baseSlug: 'gif-urls',
      detected: GIF,
    });

    const urls = buildImageUrls(result, 'http://localhost:3000');
    expect(urls.thumb).toBeNull();
    expect(urls.srcset).toBe('');
    expect(urls.srcsetWebp).toBe('');
    expect(urls.srcsetAvif).toBe('');
    expect(urls.original).toBe('http://localhost:3000/uploads/gif-urls.gif');
  });
});
