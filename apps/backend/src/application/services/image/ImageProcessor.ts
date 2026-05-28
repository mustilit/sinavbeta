/**
 * Image processing pipeline — Sharp tabanlı responsive variant üretici.
 *
 * SENARYO:
 *   Eğitici 4MB / 4032x3024 telefon fotoğrafı yüklüyor. Mobil aday 360px
 *   ekranda bu dosyayı çekiyor → 4MB indir, browser CPU resize → janky scroll
 *   + LCP > 4s. Lighthouse Performance < 60.
 *
 *   Pipeline çözer:
 *     - Origin'i once normalize et (orientation, EXIF strip, sRGB)
 *     - 3 responsive boyut üret: 320w, 640w, 1024w
 *     - Her boyuttan modern WebP varyantı yaz (~30-50% küçük JPEG'e göre)
 *     - 96x96 thumbnail (avatar, kart önizleme)
 *
 *   Frontend `<img srcset>` kullanır:
 *     <img
 *       src="/uploads/abc-1024w.webp"
 *       srcset="/uploads/abc-320w.webp 320w,
 *               /uploads/abc-640w.webp 640w,
 *               /uploads/abc-1024w.webp 1024w"
 *       sizes="(max-width: 640px) 100vw, 1024px"
 *       loading="lazy"
 *     />
 *
 *   Browser ekran boyutuna göre en uygun varyantı indirir → 4MB yerine ~80KB.
 *
 * GIF KARARI:
 *   GIF'leri yeniden işlemiyoruz (animasyon kaybolur). Origin file döner,
 *   variants boş döner. CSS ile boyutlandırılır.
 *
 * EXIF / GÜVENLİK:
 *   Sharp varsayılan olarak EXIF strip yapar (`withMetadata` çağrılmazsa).
 *   Bu, GPS koordinatı + cihaz bilgisi sızıntısını engeller.
 *
 * ORIENTATION:
 *   Telefon fotoğrafı çoğu zaman EXIF Orientation=6 (rotate 90). Sharp
 *   `.rotate()` (parametresiz) bunu otomatik düzeltir, sonra metadata strip
 *   olunca tarayıcı yeniden döndürmeye kalkışmaz.
 *
 * AVIF (Sprint 12 #2):
 *   Her WebP varyantına paralel olarak AVIF de üretilir (browser support %93+
 *   Chrome 85 / Safari 16 / Firefox 93). Frontend `<picture>` ile fallback chain
 *   kurar — AVIF destekleyen tarayıcı %30-40 daha küçük dosya indirir.
 *
 *   Trade-off: AVIF encode WebP'ye göre ~12x yavaş (libavif effort=4).
 *   Yüksek upload hacminde dedicated worker'a taşınabilir (Phase 3).
 *
 * KAPSAM DIŞI (Phase 3):
 *   - S3 multipart upload — şu an local disk
 *   - On-demand resize (CDN behind /uploads/) — şu an precompute
 *   - AVIF encode'u BullMQ worker'a taşımak — yüksek upload hacminde
 */

import sharp from 'sharp';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import type { DetectedFile } from '../../security/fileTypeDetection';

/** Üretilecek genişlikler — `<img srcset>` ile birebir uyumlu. */
export const RESPONSIVE_WIDTHS = [320, 640, 1024] as const;
export const THUMBNAIL_SIZE = 96;

export type ResponsiveWidth = (typeof RESPONSIVE_WIDTHS)[number];

export interface ImageVariant {
  label: string; // "320w" | "640w" | "1024w" | "thumb"
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp' | 'avif';
  filename: string;
  bytes: number;
}

export interface ProcessedImage {
  /** Origin (normalize edilmiş, EXIF strip + auto-rotate uygulanmış). */
  original: ImageVariant;
  /** 320w/640w/1024w + thumbnail. GIF için boş. */
  variants: ImageVariant[];
  /** Sharp metadata snapshot. */
  meta: {
    width: number;
    height: number;
    format: string;
    bytes: number;
  };
}

export interface ImageProcessorOptions {
  /** Yazılacak hedef dizin. */
  outputDir: string;
  /** Çıktı dosyalarının ortak slug'ı (örn. crypto hex). */
  baseSlug: string;
  /** Origin file metadata (magic-byte tespiti). */
  detected: DetectedFile;
}

/**
 * Buffer'ı Sharp ile işleyip varyantları diske yazar.
 *
 * `detected.type === 'gif'` → tek dosya, varyant yok.
 * Diğer formatlarda 4 varyant: 320w/640w/1024w/thumb. Hepsi WebP yazar.
 * Origin dosya kendi formatında kalır (JPEG → .jpg, PNG → .png, WebP → .webp).
 */
export async function processImage(
  buffer: Buffer,
  opts: ImageProcessorOptions,
): Promise<ProcessedImage> {
  const { outputDir, baseSlug, detected } = opts;

  // --- GIF: animasyonu bozmamak için pass-through ---
  if (detected.type === 'gif') {
    const filename = `${baseSlug}${detected.extension}`;
    const fullPath = join(outputDir, filename);
    await writeFile(fullPath, buffer);
    const meta = await sharp(buffer, { animated: true }).metadata();
    return {
      original: {
        label: 'origin',
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        format: 'png', // animated GIF, ama tip union'a uyumlu kalsın
        filename,
        bytes: buffer.length,
      },
      variants: [],
      meta: {
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        format: 'gif',
        bytes: buffer.length,
      },
    };
  }

  // --- Origin: rotate + strip metadata, kendi formatında yaz ---
  // `.rotate()` parametresiz → EXIF Orientation'u uygula, sonra strip et.
  const normalized = sharp(buffer).rotate();
  const meta = await normalized.metadata();

  const originPipeline = applyFormat(normalized.clone(), detected.type);
  const originBuffer = await originPipeline.toBuffer();
  const originFilename = `${baseSlug}${detected.extension}`;
  await writeFile(join(outputDir, originFilename), originBuffer);

  const original: ImageVariant = {
    label: 'origin',
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: detected.type === 'webp' ? 'webp' : detected.type === 'png' ? 'png' : 'jpeg',
    filename: originFilename,
    bytes: originBuffer.length,
  };

  // --- Responsive varyantları: her width için WebP + AVIF ---
  // Kaynaktan büyük üretmiyoruz (`withoutEnlargement: true`).
  // Sprint 12 #2: AVIF eklendi — AV1 codec, WebP'den ~%30 daha küçük; encode 12x yavaş.
  const variants: ImageVariant[] = [];
  for (const w of RESPONSIVE_WIDTHS) {
    const webp = await renderVariant(buffer, {
      width: w,
      label: `${w}w`,
      baseSlug,
      outputDir,
      format: 'webp',
    });
    if (webp) variants.push(webp);

    const avif = await renderVariant(buffer, {
      width: w,
      label: `${w}w`,
      baseSlug,
      outputDir,
      format: 'avif',
    });
    if (avif) variants.push(avif);
  }

  // --- Thumbnail (square crop, smartcrop) — WebP yeter; AVIF tek küçük varyant
  //     için encode/decode maliyetine değmez (avatar boyutunda %5-10 fark).
  const thumb = await renderVariant(buffer, {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    label: 'thumb',
    baseSlug,
    outputDir,
    fit: 'cover',
    format: 'webp',
  });
  if (thumb) variants.push(thumb);

  return {
    original,
    variants,
    meta: {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      format: meta.format ?? detected.type,
      bytes: buffer.length,
    },
  };
}

interface VariantRenderOpts {
  width: number;
  height?: number;
  label: string;
  baseSlug: string;
  outputDir: string;
  fit?: 'cover' | 'inside';
  /** Çıktı formatı — WebP (varsayılan) veya AVIF (Sprint 12 #2). */
  format?: 'webp' | 'avif';
}

async function renderVariant(
  buffer: Buffer,
  o: VariantRenderOpts,
): Promise<ImageVariant | null> {
  const format = o.format ?? 'webp';

  // Origin'den her zaman yeni pipeline; clone() animated GIF olmadığı için güvenli.
  let pipeline = sharp(buffer)
    .rotate()
    .resize({
      width: o.width,
      height: o.height,
      fit: o.fit ?? 'inside',
      withoutEnlargement: true,
    });

  if (format === 'avif') {
    // effort=4 dengeli: 0 hızlı/büyük, 9 yavaş/küçük. 4 prod sweet spot.
    // quality=60 AVIF için makul (WebP 80 ≈ AVIF 60).
    pipeline = pipeline.avif({ quality: 60, effort: 4 });
  } else {
    pipeline = pipeline.webp({ quality: 80, effort: 4 });
  }

  const data = await pipeline.toBuffer({ resolveWithObject: true });
  // resize sonrası gerçek genişlik/yükseklik info içinde geliyor.
  const ext = format === 'avif' ? 'avif' : 'webp';
  const filename = `${o.baseSlug}-${o.label}.${ext}`;
  await writeFile(join(o.outputDir, filename), data.data);

  return {
    label: o.label,
    width: data.info.width,
    height: data.info.height,
    format,
    filename,
    bytes: data.data.length,
  };
}

/** Origin output için tip-spesifik encoder + kalite ayarı. */
function applyFormat(
  pipeline: sharp.Sharp,
  type: DetectedFile['type'],
): sharp.Sharp {
  switch (type) {
    case 'jpeg':
      return pipeline.jpeg({ quality: 82, mozjpeg: true });
    case 'png':
      return pipeline.png({ compressionLevel: 9, palette: true });
    case 'webp':
      return pipeline.webp({ quality: 82, effort: 4 });
    default:
      return pipeline;
  }
}

/**
 * URL builder — controller `<picture>` ve `<img srcset>` için frontend'in tükettiği shape'i çevirir.
 *
 * Sprint 12 #2: AVIF + WebP srcset'leri ayrı stringlerde döner. Frontend `<picture>`
 * elementinde `<source type="image/avif">` + `<source type="image/webp">` + `<img>`
 * fallback chain'i kurar; tarayıcı destekleyen ilk format'ı indirir.
 *
 * Çıktı:
 *   {
 *     original:   '/uploads/abc.jpg',
 *     thumb:      '/uploads/abc-thumb.webp',
 *     srcsetAvif: '/uploads/abc-320w.avif 320w, ...',
 *     srcsetWebp: '/uploads/abc-320w.webp 320w, ...',
 *     srcset:     <=>= srcsetWebp (geriye dönük uyumluluk),
 *     sizes:      '(max-width: 640px) 100vw, 1024px'
 *   }
 */
export function buildImageUrls(processed: ProcessedImage, baseUrl: string) {
  const base = `${baseUrl}/uploads`;
  const avifParts: string[] = [];
  const webpParts: string[] = [];
  let thumb: string | null = null;

  for (const v of processed.variants) {
    if (v.label === 'thumb') {
      thumb = `${base}/${v.filename}`;
      continue;
    }
    if (!v.label.endsWith('w')) continue;

    if (v.format === 'avif') {
      avifParts.push(`${base}/${v.filename} ${v.label}`);
    } else if (v.format === 'webp') {
      webpParts.push(`${base}/${v.filename} ${v.label}`);
    }
  }

  const srcsetWebp = webpParts.join(', ');
  const srcsetAvif = avifParts.join(', ');

  return {
    original: `${base}/${processed.original.filename}`,
    thumb,
    // Geriye dönük uyumluluk: eski client'lar `srcset` bekler → WebP listesini ver
    srcset: srcsetWebp,
    srcsetWebp,
    srcsetAvif,
    // 640px altı mobile → tam viewport; üstü desktop → max 1024px container.
    sizes: '(max-width: 640px) 100vw, 1024px',
    width: processed.original.width,
    height: processed.original.height,
  };
}
