/**
 * Build sonrası asset kopyalama.
 *
 * `tsc` yalnızca .ts dosyalarını derler; runtime'da okunan non-ts asset'leri
 * (Handlebars e-posta şablonları .hbs/.txt, AI moderasyon prompt'ları .md,
 * statik .json) dist'e taşımaz. Bu script bunları src → dist yapısını koruyarak
 * kopyalar. Aksi halde `node dist/nest/main.js` boot'ta ENOENT ile çöker
 * (örn. ClaudeTextProvider → prompts/text-moderation.tr.md).
 *
 * Cross-platform (Windows + Linux), bağımlılıksız. `npm run build` zincirinde
 * `tsc`'den sonra çalışır.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const DIST = path.join(__dirname, '..', 'dist');

let copied = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (!entry.name.endsWith('.ts')) {
      const rel = path.relative(SRC, full);
      const dest = path.join(DIST, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(full, dest);
      copied += 1;
    }
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`[copy-assets] src bulunamadı: ${SRC}`);
  process.exit(1);
}
if (!fs.existsSync(DIST)) {
  console.error(`[copy-assets] dist bulunamadı — önce tsc çalışmalı: ${DIST}`);
  process.exit(1);
}

walk(SRC);
console.log(`[copy-assets] ${copied} asset dosyası src → dist kopyalandı.`);
