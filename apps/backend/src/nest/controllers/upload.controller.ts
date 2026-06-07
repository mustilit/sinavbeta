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
import { Public } from '../decorators/public.decorator';
import type { Request } from 'express';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
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

    // Görsel URL'leri GÖRECELİ kaydedilir (`/uploads/...`), mutlak değil.
    // Sebep: host/IP/domain DB kaydına gömülürse değişimde tüm görseller kırılır
    // (178.105.231.185 olayı, 2026-06-07). Göreceli yol prod'da nginx `/uploads/`
    // proxy'si, dev'de Vite `/upload` proxy'si, CDN'de `cdnUrl()` (VITE_CDN_BASE_URL)
    // ile çözülür. Host bağımsızdır.
    const baseUrl = '';
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

  /**
   * PDF doküman yükleme (eğitici CV vb.). Görsel pipeline'ından AYRI — Sharp'tan
   * geçmez. Yalnızca PDF magic byte + boyut doğrulanıp diske yazılır.
   *   1. Multer memoryStorage + fileFilter (application/pdf MIME ön eleme)
   *   2. Magic byte "%PDF-" kontrolü (HTTP MIME'a güvenmeyiz)
   *   3. Filename crypto.randomBytes → path traversal yok
   *   4. Max 5MB, opsiyonel ClamAV
   */
  @Post('document')
  @Roles('EDUCATOR', 'ADMIN', 'WORKER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req: Request, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Sadece PDF dosyası yüklenebilir'), false);
        }
        cb(null, true);
      },
    }),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async uploadDocument(@UploadedFile() file: any) {
    return this.storePdf(file);
  }

  /**
   * Kayıt (eğitici onboarding) sırasında CV yükleme — PUBLIC.
   *
   * Neden public: kullanıcı henüz kayıt OLMADAN CV yüklemek zorunda (step 2),
   * yani JWT'si yok. Auth'lu `/upload/document`'a giderse 401 alır ve frontend
   * apiClient global 401 handler'ı kullanıcıyı Login'e fırlatır (yaşanan bug).
   *
   * Güvenlik: `/upload/document` ile AYNI doğrulamalar — PDF magic byte + 5MB +
   * opsiyonel ClamAV + crypto random filename. Prod'da global throttler rate
   * limit uygular. Görsel pipeline'ından geçmez (Sharp yok).
   */
  @Public()
  @Post('registration-cv')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req: Request, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(new BadRequestException('Sadece PDF dosyası yüklenebilir'), false);
        }
        cb(null, true);
      },
    }),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async uploadRegistrationCv(@UploadedFile() file: any) {
    return this.storePdf(file);
  }

  /**
   * Ortak PDF doğrulama + diske yazma. `uploadDocument` (auth) ve
   * `uploadRegistrationCv` (public) tarafından paylaşılır.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async storePdf(file: any): Promise<{ url: string; filename: string; size: number }> {
    if (!file) throw new BadRequestException('Dosya bulunamadı');
    if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('Dosya içeriği okunamadı');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`Dosya boyutu ${MAX_SIZE_BYTES / 1024 / 1024}MB'dan büyük olamaz`);
    }

    // Magic byte: gerçek PDF "%PDF-" ile başlar (ilk 1KB içinde). HTTP MIME'a güvenme.
    const head = file.buffer.subarray(0, 1024).toString('latin1');
    if (!head.includes('%PDF-')) {
      throw new BadRequestException('Geçersiz PDF dosyası');
    }

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

    const filename = `${Date.now()}-${randomBytes(16).toString('hex')}.pdf`;
    try {
      writeFileSync(join(UPLOAD_DIR, filename), file.buffer);
    } catch (err) {
      this.logger.error(`PDF yazma hatası: ${(err as Error).message}`);
      throw new BadRequestException('Dosya kaydedilemedi');
    }

    // Göreceli URL — bkz. uploadImage'deki açıklama (host bağımsızlık).
    return { url: `/uploads/${filename}`, filename, size: file.size };
  }
}
