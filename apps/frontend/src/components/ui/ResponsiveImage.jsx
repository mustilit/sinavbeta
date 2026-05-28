/**
 * ResponsiveImage — Sharp pipeline tüketicisi.
 *
 * Sprint 11 #2'de oluşturuldu. Sprint 12 #2'de `<picture>` + AVIF/WebP fallback
 * chain eklendi: tarayıcı destekliyorsa AVIF (~%30 daha küçük), yoksa WebP, yoksa
 * origin JPEG/PNG. Tarayıcı negotiation otomatik — JS yok.
 *
 * Backend `/upload/image` payload shape:
 *   responsive: {
 *     thumb:      string | null,         // 96x96 WebP
 *     srcset:     string,                // legacy alias = srcsetWebp
 *     srcsetWebp: string,                // "url 320w, url 640w, url 1024w"
 *     srcsetAvif: string,                // AVIF varyantları (boş olabilir — eski kayıt)
 *     sizes:      string,                // "(max-width: 640px) 100vw, 1024px"
 *     width:      number,                // origin width — CLS reserve
 *     height:     number,                // origin height
 *   }
 *
 * KULLANIM:
 *
 *   // 1) Backend upload payload'undan (TestPackage kapak, soru görseli vb.)
 *   <ResponsiveImage
 *     src={pkg.coverImageUrl}
 *     responsive={pkg.coverImageResponsive}
 *     alt={pkg.title}
 *     className="w-full h-48 object-cover rounded"
 *   />
 *
 *   // 2) Sadece tek URL biliyorsak (legacy kayıtlar) — fallback
 *   <ResponsiveImage src="/uploads/old.jpg" alt="..." />
 *
 *   // 3) Avatar: srcset gereksiz, thumb yeter
 *   <ResponsiveImage src={user.avatarUrl} variant="thumb" alt={user.name} />
 *
 *   // 4) Hero / above-the-fold — LCP'yi etkiler
 *   <ResponsiveImage src={hero.url} responsive={hero.responsive} priority alt={hero.alt} />
 *
 * RENDER DAVRANIŞI:
 *   - `responsive.srcsetAvif` ve `responsive.srcsetWebp` ikisi de varsa → `<picture>`
 *     ile AVIF + WebP source + img fallback. Browser ilk destekleneni indirir.
 *   - Sadece srcset (legacy backend) → düz `<img srcset>`.
 *   - variant="thumb" → her ihtimalde tek `<img src={thumb}>` (kare avatar, srcset gereksiz).
 *   - responsive yoksa → fallback düz `<img src>` (legacy kayıt).
 *
 * NEDEN BU KADAR ZIP?
 *   - `loading="lazy"` — viewport altı görseller LCP'yi etkilemez
 *   - `decoding="async"` — main thread'i bloklamaz
 *   - `width`/`height` attribute → CLS=0 (layout reserve edilir)
 *   - AVIF: %30-40 daha küçük → mobil veri tasarrufu
 *   - WebP: %96 browser support → güvenli fallback
 *
 * `priority` (hero) görselleri için `loading="eager"` + `fetchpriority="high"` ver.
 */

import PropTypes from 'prop-types';
import { cdnUrl } from '../../lib/cdn';

/** Backend srcset'ini CDN URL'lerine rewrite eder. */
function rewriteSrcset(srcset) {
  if (!srcset) return '';
  return srcset
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      const [url, descriptor] = trimmed.split(/\s+/);
      return `${cdnUrl(url)} ${descriptor || ''}`.trim();
    })
    .join(', ');
}

export function ResponsiveImage({
  src,
  responsive,
  alt,
  variant = 'auto',
  priority = false,
  className = '',
  sizes: sizesOverride,
  ...rest
}) {
  const loading = priority ? 'eager' : 'lazy';
  const priorityProps = priority ? { fetchpriority: 'high' } : {};

  // Variant=thumb → küçük WebP varsa kullan, yoksa origin'e düş.
  if (variant === 'thumb' && responsive?.thumb) {
    return (
      <img
        src={cdnUrl(responsive.thumb)}
        alt={alt}
        width={96}
        height={96}
        loading={loading}
        decoding="async"
        className={className}
        {...priorityProps}
        {...rest}
      />
    );
  }

  // Sharp payload var → `<picture>` ile AVIF + WebP + origin fallback.
  // Sprint 12 #2: `srcsetAvif` boşsa AVIF source basmıyoruz (tarayıcı boş srcset'i
  // hata olarak görmez ama temiz olsun).
  if (responsive?.srcsetWebp || responsive?.srcset) {
    const webpSrcset = rewriteSrcset(responsive.srcsetWebp || responsive.srcset);
    const avifSrcset = rewriteSrcset(responsive.srcsetAvif || '');
    const sizes = sizesOverride || responsive.sizes;
    const width = responsive.width || undefined;
    const height = responsive.height || undefined;
    const fallbackSrc = cdnUrl(src || '');

    // AVIF varsa picture, yoksa düz img — gereksiz wrapping olmasın.
    if (avifSrcset) {
      return (
        <picture>
          <source type="image/avif" srcSet={avifSrcset} sizes={sizes} />
          <source type="image/webp" srcSet={webpSrcset} sizes={sizes} />
          <img
            src={fallbackSrc}
            srcSet={webpSrcset}
            sizes={sizes}
            width={width}
            height={height}
            alt={alt}
            loading={loading}
            decoding="async"
            className={className}
            {...priorityProps}
            {...rest}
          />
        </picture>
      );
    }

    // Legacy backend (Sprint 11) — sadece WebP srcset
    return (
      <img
        src={fallbackSrc}
        srcSet={webpSrcset}
        sizes={sizes}
        width={width}
        height={height}
        alt={alt}
        loading={loading}
        decoding="async"
        className={className}
        {...priorityProps}
        {...rest}
      />
    );
  }

  // Fallback: legacy kayıt (Sharp pipeline öncesi) — sadece src
  return (
    <img
      src={cdnUrl(src || '')}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      {...priorityProps}
      {...rest}
    />
  );
}

ResponsiveImage.propTypes = {
  /** Origin image URL (Sharp pipeline öncesi de çalışır) */
  src: PropTypes.string,
  /** Backend `/upload/image` payload'unun `responsive` bloğu */
  responsive: PropTypes.shape({
    thumb: PropTypes.string,
    srcset: PropTypes.string,
    srcsetWebp: PropTypes.string,
    srcsetAvif: PropTypes.string,
    sizes: PropTypes.string,
    width: PropTypes.number,
    height: PropTypes.number,
  }),
  /** Erişilebilirlik için zorunlu — boş string ise dekoratif */
  alt: PropTypes.string.isRequired,
  /** "auto" = srcset, "thumb" = sadece 96px varyant */
  variant: PropTypes.oneOf(['auto', 'thumb']),
  /** Above-the-fold hero görseli için true */
  priority: PropTypes.bool,
  className: PropTypes.string,
  sizes: PropTypes.string,
};

export default ResponsiveImage;
