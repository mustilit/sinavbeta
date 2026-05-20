# CDN + Asset Cache Stratejisi

KALITE-DEGERLENDIRME §4 (Verimlilik) önerisi. Frontend asset'ları + kullanıcı medyası için CDN.

## Hedefler

| Metric | Bugün (örnek) | CDN sonrası |
|---|---|---|
| FCP (First Contentful Paint) | 1.8s | < 1.0s |
| LCP (Largest Contentful Paint) | 3.2s | < 1.8s |
| TTFB (Time to First Byte) | 350ms | < 100ms (edge'den) |
| Bundle transfer | 480KB gzipped | aynı, ama edge'den |
| User-uploaded image | direkt origin | edge cache + WebP |

## Mimari

```
Kullanıcı (Türkiye)
     │
     ▼ HTTPS
┌──────────────────┐
│  CDN edge        │  (CloudFront / Bunny / Fastly)
│  - SPA static    │  (TR edge: İstanbul, Ankara)
│  - User medya    │
│  - API response* │  (* sadece cacheable GET'ler)
└────────┬─────────┘
         │ cache miss
         ▼
┌──────────────────┐
│  Origin          │  (Kubernetes Ingress)
│  - Nginx + SPA   │
│  - Backend API   │
│  - S3 medya      │
└──────────────────┘
```

## CDN seçenekleri karşılaştırması

| Sağlayıcı | TR edge | Maliyet (1TB/ay) | Notlar |
|---|---|---|---|
| **CloudFront** | İstanbul + Ankara | ~$85 (TR çıkışı) | AWS entegrasyon, ACM TLS, terraform iyi |
| **Bunny CDN** | İstanbul | ~$10 | En ucuz, KVKK-friendly EU regions |
| **Cloudflare** | İstanbul | $0 (free) / Pro $20 | Free tier var, gerçek bandwidth costs unclear |
| **Fastly** | İstanbul | ~$50 | VCL ile esnek edge logic |

**Öneri:** Bunny CDN (maliyet) veya Cloudflare (free tier). Enterprise SLA gerekirse CloudFront.

## 1. SPA statik asset'ları

Vite build output:
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── index-[hash].css
│   └── [chunk]-[hash].js
└── stats.html
```

### nginx config (origin'de)

```nginx
# infra/nginx/default.conf (mevcut, genişletilecek)

# Hash'lenmiş asset'ler — 1 yıl cache, immutable
location ~* \.[a-f0-9]{8,}\.(js|css|woff2?|svg|png|jpg|jpeg|webp|avif)$ {
    expires 1y;
    add_header Cache-Control "public, immutable, max-age=31536000";
    access_log off;
}

# index.html — cache yok, her zaman fresh (CDN bypass-cache rule)
location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    expires off;
}

# Brotli + gzip
brotli on;
brotli_static on;
brotli_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
```

### CDN config (CloudFront örnek)

```hcl
resource "aws_cloudfront_distribution" "spa" {
  enabled         = true
  is_ipv6_enabled = true
  default_root_object = "index.html"

  origin {
    domain_name = "origin.sinavsalonu.example"
    origin_id   = "spa-origin"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "spa-origin"

    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = aws_cloudfront_cache_policy.spa_assets.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # SPA fallback: /any-route → /index.html (200, mock 404)
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  # ... TLS, aliases
}

resource "aws_cloudfront_cache_policy" "spa_assets" {
  name        = "spa-assets"
  default_ttl = 31536000  # 1 yıl
  max_ttl     = 31536000
  min_ttl     = 0
  # /index.html için ayrı policy ile no-cache zorlanır
}
```

### Cache invalidation (release sonrası)

Vite hash'li asset'lerle invalidation gerek YOK — yeni hash → yeni URL. Sadece `index.html` invalidate edilmeli:

```bash
aws cloudfront create-invalidation \
  --distribution-id ABCDEF \
  --paths "/index.html" "/"
```

## 2. User-uploaded medya

Mevcut: backend `/uploads` statik servisinden direkt. Sorunlar:
- Tek pod → ölçek yok
- WebP/AVIF dönüşümü yok
- Multi-size yok

### Hedef akış

```
1. User upload → backend → S3 (pre-signed PUT URL)
2. S3 → Lambda/worker trigger → Sharp ile WebP + 3 boyut (sm, md, lg)
3. CDN S3'ten serve eder
4. Frontend `<img srcset>` ile boyut seçer
```

### Sharp service (gelecek implementasyon)

```ts
// apps/backend/src/infrastructure/services/ImageProcessor.ts
import sharp from 'sharp';

const SIZES = { sm: 320, md: 640, lg: 1280 };

export async function processImage(input: Buffer) {
  const variants: Record<string, Buffer> = {};
  for (const [key, width] of Object.entries(SIZES)) {
    variants[`${key}.webp`] = await sharp(input)
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    variants[`${key}.avif`] = await sharp(input)
      .resize(width, null, { withoutEnlargement: true })
      .avif({ quality: 70 })
      .toBuffer();
  }
  return variants;
}
```

Frontend:

```jsx
<picture>
  <source type="image/avif" srcSet={`${url}/sm.avif 320w, ${url}/md.avif 640w, ${url}/lg.avif 1280w`} />
  <source type="image/webp" srcSet={`${url}/sm.webp 320w, ${url}/md.webp 640w, ${url}/lg.webp 1280w`} />
  <img src={`${url}/md.jpg`} alt="..." loading="lazy" />
</picture>
```

## 3. API response cache (popüler listings)

Belirli endpoint'ler CDN'de kısa süreli cache'lenebilir:

```
GET /marketplace/tests/popular              → 60s
GET /marketplace/educators/featured         → 5 dk
GET /tenants/<slug>/landing-page            → 10 dk
```

ETag desteği:

```ts
@Get('popular')
async popular(@Res({ passthrough: true }) res) {
  const data = await this.uc.execute();
  const etag = createHash('md5').update(JSON.stringify(data)).digest('hex');
  res.setHeader('ETag', `"${etag}"`);
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  return data;
}
```

CDN `s-maxage` honor eder (Cache-Control: public + s-maxage).

**Dikkat:** Tenant-aware endpoint'lerde `Vary: Tenant-Id` ile tenant'a göre ayrı cache. Yoksa cross-tenant leak.

## 4. Security headers (CDN response headers policy)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Resource-Policy: same-site
```

## Maliyet hesabı (örnek)

Aylık 100k MAU, kullanıcı başı 5MB asset transfer:
- Toplam: ~500GB/ay
- Bunny: ~$5–10
- CloudFront: ~$40–60

User medya 100GB/ay storage + 1TB transfer:
- S3: ~$3 storage + $90 egress
- CDN cache hit %80 → S3 egress ~$18

Toplam aylık: ~$30–80.

## Ölç ve doğrula

- Lighthouse CI (Performance ≥ 90 hedef)
- `curl -I` ile cache header'larını kontrol
- CDN dashboard: Cache hit ratio > %80
- WebPageTest: TTFB, FCP, LCP

## İlgili

- KALITE-DEGERLENDIRME §4 (Verimlilik)
- Skill: `release-engineering` (cache invalidation release script'i)
