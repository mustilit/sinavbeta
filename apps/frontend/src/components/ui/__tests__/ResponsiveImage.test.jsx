/**
 * ResponsiveImage component unit testleri.
 *
 * Sprint 11 #2 — Sharp pipeline backend payload'unu doğru tükettiğini doğrular.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponsiveImage } from '../ResponsiveImage';

describe('ResponsiveImage', () => {
  const LEGACY_RESPONSIVE = {
    thumb: 'http://api/uploads/abc-thumb.webp',
    srcset:
      'http://api/uploads/abc-320w.webp 320w, http://api/uploads/abc-640w.webp 640w, http://api/uploads/abc-1024w.webp 1024w',
    sizes: '(max-width: 640px) 100vw, 1024px',
    width: 2000,
    height: 1500,
  };

  const RESPONSIVE = {
    thumb: 'http://api/uploads/abc-thumb.webp',
    srcset:
      'http://api/uploads/abc-320w.webp 320w, http://api/uploads/abc-640w.webp 640w, http://api/uploads/abc-1024w.webp 1024w',
    srcsetWebp:
      'http://api/uploads/abc-320w.webp 320w, http://api/uploads/abc-640w.webp 640w, http://api/uploads/abc-1024w.webp 1024w',
    srcsetAvif:
      'http://api/uploads/abc-320w.avif 320w, http://api/uploads/abc-640w.avif 640w, http://api/uploads/abc-1024w.avif 1024w',
    sizes: '(max-width: 640px) 100vw, 1024px',
    width: 2000,
    height: 1500,
  };

  it('AVIF + WebP srcset varsa <picture> ile 2 source basar (Sprint 12 #2)', () => {
    const { container } = render(
      <ResponsiveImage
        src="http://api/uploads/abc.jpg"
        responsive={RESPONSIVE}
        alt="Kapak görseli"
      />,
    );

    const picture = container.querySelector('picture');
    expect(picture).not.toBeNull();

    const sources = picture.querySelectorAll('source');
    expect(sources).toHaveLength(2);
    expect(sources[0].getAttribute('type')).toBe('image/avif');
    expect(sources[0].getAttribute('srcset')).toContain('-320w.avif 320w');
    expect(sources[1].getAttribute('type')).toBe('image/webp');
    expect(sources[1].getAttribute('srcset')).toContain('-320w.webp 320w');

    const img = screen.getByRole('img', { name: 'Kapak görseli' });
    expect(img).toHaveAttribute('src', 'http://api/uploads/abc.jpg');
    expect(img.getAttribute('srcset')).toContain('-320w.webp 320w'); // fallback srcset
    expect(img).toHaveAttribute('width', '2000');
    expect(img).toHaveAttribute('height', '1500');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('AVIF olmadan (legacy backend) <picture> wrap olmaz, düz <img srcset>', () => {
    const { container } = render(
      <ResponsiveImage
        src="http://api/uploads/abc.jpg"
        responsive={LEGACY_RESPONSIVE}
        alt="Eski kayıt"
      />,
    );

    expect(container.querySelector('picture')).toBeNull();
    const img = screen.getByRole('img', { name: 'Eski kayıt' });
    expect(img).toHaveAttribute('src', 'http://api/uploads/abc.jpg');
    expect(img.getAttribute('srcset')).toContain('320w');
    expect(img.getAttribute('srcset')).toContain('640w');
    expect(img.getAttribute('srcset')).toContain('1024w');
  });

  it('variant="thumb" sadece 96x96 thumbnail döner', () => {
    render(
      <ResponsiveImage
        src="http://api/uploads/abc.jpg"
        responsive={RESPONSIVE}
        variant="thumb"
        alt="Avatar"
      />,
    );

    const img = screen.getByRole('img', { name: 'Avatar' });
    expect(img).toHaveAttribute('src', 'http://api/uploads/abc-thumb.webp');
    expect(img).toHaveAttribute('width', '96');
    expect(img).toHaveAttribute('height', '96');
    // srcset BASILMAZ — tek kaynak yeterli
    expect(img).not.toHaveAttribute('srcset');
  });

  it('priority=true → loading=eager + fetchpriority=high', () => {
    render(
      <ResponsiveImage
        src="http://api/uploads/hero.jpg"
        responsive={RESPONSIVE}
        priority
        alt="Hero"
      />,
    );
    const img = screen.getByRole('img', { name: 'Hero' });
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('responsive yoksa fallback: sadece src', () => {
    render(<ResponsiveImage src="http://api/uploads/legacy.jpg" alt="Eski kayıt" />);
    const img = screen.getByRole('img', { name: 'Eski kayıt' });
    expect(img).toHaveAttribute('src', 'http://api/uploads/legacy.jpg');
    expect(img).not.toHaveAttribute('srcset');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('sizes prop responsive.sizes üzerine yazar', () => {
    render(
      <ResponsiveImage
        src="http://api/uploads/abc.jpg"
        responsive={RESPONSIVE}
        sizes="50vw"
        alt="custom"
      />,
    );
    const img = screen.getByRole('img', { name: 'custom' });
    expect(img).toHaveAttribute('sizes', '50vw');
  });

  it('boş alt değeri prop required hatası vermez (dekoratif)', () => {
    // Note: PropTypes.isRequired uyarı verir ama crash YOK — Boş string geçerli alt.
    const { container } = render(
      <ResponsiveImage src="http://api/uploads/decorative.jpg" alt="" />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('alt', '');
  });
});
