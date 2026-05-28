import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Roles } from '../decorators/roles.decorator';
import type { Request } from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { validateImageUpload } from '../../application/security/fileTypeDetection';
import { isClean as scanForVirus } from '../../application/security/clamavScan';
import { processImage, buildImageUrls } from '../../application/services/image/ImageProcessor';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// uploads/ klasörü yoksa oluştur
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Güvenli görsel yükleme endpoint'i.
 *
 * GÜVENLİK KATMANLARI:
 *   1. Multer memoryStorage → dosya disk'e yazılmadan önce magic byte kontrolü
 *   2. validateImageUpload() → SVG reject + JPEG/PNG/WebP/GIF whitelist
 *   3. Filename randomized (crypto.randomBytes) → path traversal yok
 *   4. Extension dosyanın gerçek tipinden (HTTP header DEĞİL)
 *   5. Max 5MB
 *   6. Roles guard ile auth zorunlu
 *
 * GELECEK (Sprint 8):
 *   - ClamAV virus scan (polyglot dosyalar için)
 *   - S3 pre-signed URL (uploads/ disk yerine object storage)
 */
@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  @Post('image')
  @Roles('CANDIDATE', 'EDUCATOR', 'ADMIN', 'WORKER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      // memoryStorage: magic byte check ÖNCE, disk yazma SONRA. Multer
      // diskStorage kullansaydık, geçersiz dosya zaten disk'e düşmüş olurdu.
      limits: { fileSize: MAX_SIZE_BYTES },
      // İlk filtre: HTTP MIME type'a güvenmiyoruz ama açıkça image/* dışını
      // erkenden reddet (bandwidth tasarrufu). Gerçek doğrulama controller'da.
      fileFilter: (_req: Request, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Sadece görsel dosyası yüklenebilir'), false);
        }
        cb(null, true);
      },
    }),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async uploadImage(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Dosya bulunamadı');
    if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('Dosya içeriği okunamadı');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`Dosya boyutu ${MAX_SIZE_BYTES / 1024 / 1024}MB'dan büyük olamaz`);
    }

    // KATMAN 1: Magic byte detection — HTTP MIME header'a asla güvenme.
    const validation = validateImageUpload(file.buffer);
    if (!validation.ok) {
      throw new BadRequestException(validation.reason);
    }

    // KATMAN 2: ClamAV virus scan — env CLAMAV_ENABLED=true ise aktif.
    // Polyglot dosya (PNG header + PHP shell) magic byte'tan geçer ama
    // ClamAV imzasıyla yakalanabilir. Üretimde fail-closed (CLAMAV_FAIL_OPEN=false).
    if (process.env.CLAMAV_ENABLED === 'true') {
      const scan = await scanForVirus(file.buffer);
      if (!scan.clean) {
        throw new BadRequestException(
          scan.threat
            ? `Dosya virüs taramasından geçemedi: ${scan.threat}`
            : 'Dosya virüs taramasından geçemedi',
        );
      }
    }

    // Filename'i CRYPTO ile üret — kullanıcı originalName'i ile alakası yok.
    // Extension magic byte'tan geliyor → fake `.svg.jpg` gibi denemeler etkisiz.
    const randomName = randomBytes(16).toString('hex');
    const baseSlug = `${Date.now()}-${randomName}`;

    // KATMAN 3: Sharp image pipeline — Sprint 11 #2.
    // Origin + 320w/640w/1024w WebP varyantları + 96x96 thumbnail üretir.
    // EXIF strip + auto-rotate + sRGB normalize burada olur.
    let processed;
    try {
      processed = await processImage(file.buffer, {
        outputDir: UPLOAD_DIR,
        baseSlug,
        detected: validation.detected,
      });
    } catch (err) {
      // Sharp decode hatası — magic byte geçti ama bitstream bozuk olabilir
      // (truncated upload, partial multipart). Kullanıcıya 400 ver.
      this.logger.warn(`Sharp processing failed: ${(err as Error).message}`);
      throw new BadRequestException('Görsel işlenemedi — dosya bozuk veya desteklenmiyor');
    }

    const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
    const urls = buildImageUrls(processed, baseUrl);

    return {
      // Geriye dönük uyumluluk için `url` + `filename`. Yeni alanlar:
      url: urls.original,
      filename: processed.original.filename,
      size: file.size,
      detectedType: validation.detected.type,
      mimeType: validation.detected.mimeType,
      // Responsive payload — frontend `<picture>` + `<img srcset>` ile tüketir.
      // Sprint 12 #2: srcsetAvif + srcsetWebp ayrı; `srcset` legacy alias (=== webp).
      responsive: {
        thumb: urls.thumb,
        srcset: urls.srcset,         // legacy — webp ile aynı
        srcsetWebp: urls.srcsetWebp,
        srcsetAvif: urls.srcsetAvif,
        sizes: urls.sizes,
        width: urls.width,
        height: urls.height,
      },
      variants: processed.variants.map((v) => ({
        label: v.label,
        width: v.width,
        height: v.height,
        format: v.format,
        bytes: v.bytes,
        url: `${baseUrl}/uploads/${v.filename}`,
      })),
    };
  }
}
