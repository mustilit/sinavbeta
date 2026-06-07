/**
 * Görsel yükleme — host-bağımsız GÖRECELİ URL + gerçek render regresyon testi.
 *
 * BAĞLAM (178.105.231.185 olayı, 2026-06-07):
 *   Soru/şık/kapak görselleri ekrana gelmiyordu. İki kök neden vardı:
 *     1) Upload yanıtı host'u (BACKEND_URL) URL'e gömüyordu → host değişince kırıldı.
 *     2) Yüklenen dosyalar deploy'da kayboluyordu (volume yoktu).
 *   Bu test, gerçek tarayıcı + proxy + backend üzerinden bir görsel yükleyip:
 *     - dönen URL'in GÖRECELİ olduğunu (`/uploads/...`, scheme+host YOK),
 *     - o URL'in gerçekten servis edilip tarayıcıda render edildiğini (naturalWidth > 0)
 *   doğrular. Eğitici gerçek JWT'siyle (login fixture) gerçek `/upload/image`'a gider —
 *   wizard UI'ına bağımlı değil, bu yüzden kırılgan değil.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '../fixtures/auth';

const FIXTURE_PNG = fileURLToPath(new URL('../fixtures/sample-image.png', import.meta.url));
const ABSOLUTE_URL = /https?:\/\//; // mutlak URL işareti — olmamalı

test.describe('görsel yükleme', () => {
  test('upload/image GÖRECELİ url döner ve görsel gerçekten render olur', async ({ educatorPage: page }) => {
    // Aynı origin'de ol (relative fetch + /uploads proxy için) ve token'ı garanti et.
    await page.goto('/');
    const imageBytes = Array.from(readFileSync(FIXTURE_PNG));

    // 1) Gerçek auth'lu upload — uygulamanın apiClient'ı gibi Bearer token ekle.
    const upload = await page.evaluate(async (bytes) => {
      const token = localStorage.getItem('token') || localStorage.getItem('dal_auth');
      const file = new File([new Uint8Array(bytes)], 'e2e-upload.png', { type: 'image/png' });
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/upload/image', {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        /* gövde JSON değil */
      }
      return { status: res.status, data };
    }, imageBytes);

    expect(upload.status, `upload başarısız: ${JSON.stringify(upload.data)}`).toBe(201);

    const { url, responsive } = upload.data ?? {};

    // GÖRECELİ URL guard'ı — host gömülmemeli.
    expect(url).toMatch(/^\/uploads\//);
    expect(url).not.toMatch(ABSOLUTE_URL);
    expect(responsive?.srcsetWebp ?? '').toContain('/uploads/');
    for (const v of [responsive?.thumb, responsive?.srcset, responsive?.srcsetWebp, responsive?.srcsetAvif]) {
      expect(v ?? '').not.toMatch(ABSOLUTE_URL);
    }

    // 2) Dönen göreceli URL gerçekten servis ediliyor + tarayıcı render edebiliyor mu?
    //    (Dosya diskte yoksa = deploy'da kayıp senaryosu → naturalWidth 0 / onerror.)
    const rendered = await page.evaluate(
      (src) =>
        new Promise<{ ok: boolean; w: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ ok: true, w: img.naturalWidth });
          img.onerror = () => resolve({ ok: false, w: 0 });
          img.src = src;
        }),
      url as string,
    );

    expect(rendered.ok, `görsel yüklenemedi (404/serve sorunu): ${url}`).toBe(true);
    expect(rendered.w).toBeGreaterThan(0);
  });
});
