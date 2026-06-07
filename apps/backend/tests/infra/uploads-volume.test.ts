/**
 * Deploy guard — üretim compose'unda yüklenen dosyalar için KALICI named volume olmalı.
 *
 * BAĞLAM (2026-06-07): backend uploads'ı container-local diskte tutuluyordu; her
 * redeploy/recreate'te kullanıcı görselleri SİLİNDİ (LGS-1 testinin görselleri kayboldu).
 * Düzeltme: `uploads_data` named volume `/usr/src/app/uploads`'a mount edildi.
 *
 * Bu test, birinin volume mount'unu silmesini/host-bind'e çevirmesini CI'da yakalar.
 * Bağımlılıksız (saf metin) — YAML parser'a güvenmez (js-yaml backend'de sadece transitive).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const COMPOSE_PROD = join(__dirname, '..', '..', '..', '..', 'infra', 'docker', 'docker-compose.prod.yml');
const UPLOADS_TARGET = '/usr/src/app/uploads';

let raw: string;

beforeAll(() => {
  raw = readFileSync(COMPOSE_PROD, 'utf8');
});

describe('deploy guard — uploads kalıcılığı (docker-compose.prod.yml)', () => {
  it('/usr/src/app/uploads bir NAMED volume ile mount edilmiş', () => {
    // Eşleşir:  "      - uploads_data:/usr/src/app/uploads"  (opsiyonel :mode)
    // Eşleşmez: host-bind "- ./uploads:/usr/src/app/uploads" (kaynak adı [A-Za-z0-9_-]+ değil)
    const mount = raw.match(
      /^[ \t]*-[ \t]*["']?([A-Za-z0-9_-]+):\/usr\/src\/app\/uploads(?::[A-Za-z]+)?["']?[ \t]*$/m,
    );
    expect(mount).not.toBeNull(); // yoksa redeploy'da görseller kaybolur (2026-06-07 olayı)
    const source = mount![1];
    expect(source.length).toBeGreaterThan(0);
  });

  it('host-bind ile /usr/src/app/uploads mount edilMEMİŞ (taşınabilir named volume şart)', () => {
    const bind = new RegExp(
      `^[ \\t]*-[ \\t]*["']?[.\\/][^\\n:]*:${UPLOADS_TARGET.replace(/\//g, '\\/')}`,
      'm',
    );
    expect(bind.test(raw)).toBe(false);
  });

  it('mount edilen named volume top-level "volumes:" altında deklare edilmiş', () => {
    const mount = raw.match(/^[ \t]*-[ \t]*["']?([A-Za-z0-9_-]+):\/usr\/src\/app\/uploads/m);
    expect(mount).not.toBeNull();
    const source = mount![1];

    // Top-level "volumes:" bloğu (satır başında, girintisiz) — service-level değil.
    const topLevel = raw.split(/^volumes:[ \t]*$/m)[1];
    expect(topLevel).toBeTruthy(); // top-level "volumes:" bloğu olmalı
    expect(new RegExp(`^[ \\t]+${source}:`, 'm').test(topLevel)).toBe(true);
  });
});
